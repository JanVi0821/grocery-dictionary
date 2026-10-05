import process from 'node:process';
import { MongoClient, type Document } from 'mongodb';
import { Pool } from 'pg';
import { BATCH_SIZE, EXCLUDED_FIELDS, FILTER } from './config.js';

interface SourceCompletion extends Document {
  productId: number;
  source?: unknown;
  detail?: unknown;
}

interface SyncRow {
  id: number;
  detail: Record<string, unknown>;
}

interface ProductIdRow {
  id: string | number;
}

const dryRun = process.argv.includes('--dry-run');
const mongoUri = requiredEnv('MONGODB_URI');
const postgresUrl = requiredEnv('SUPABASE_DB_URL');

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function cleanDocument(document: SourceCompletion): Record<string, unknown> {
  const result = Object.fromEntries(
    Object.entries(document).filter(([key]) => !EXCLUDED_FIELDS.has(key)),
  );
  if (
    typeof result.source !== 'string' ||
    !result.source ||
    !result.detail ||
    typeof result.detail !== 'object' ||
    Array.isArray(result.detail)
  ) {
    throw new Error(`Product ${document.productId} has an invalid source or detail object`);
  }
  return result;
}

async function main(): Promise<void> {
  const mongo = new MongoClient(mongoUri);
  const pool = new Pool({
    connectionString: postgresUrl,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await mongo.connect();
    const collection = mongo
      .db('grocery_dictionary')
      .collection<SourceCompletion>('data_completion');
    const cursor = collection.find(FILTER).sort({ productId: 1 }).batchSize(BATCH_SIZE);
    const batch: SyncRow[] = [];
    let matched = 0;
    let written = 0;

    async function flush(): Promise<void> {
      if (batch.length === 0) return;
      if (dryRun) {
        const ids = batch.map(({ id }) => id);
        const { rows } = await pool.query<ProductIdRow>(
          'select id from public.products where id = any($1::bigint[])',
          [ids],
        );
        const found = new Set(rows.map(({ id }) => Number(id)));
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length) {
          throw new Error(`No products.id match for productId(s): ${missing.join(', ')}`);
        }
        console.log(
          JSON.stringify({
            event: 'batch_preview',
            ids,
            fields: Object.keys(batch[0].detail),
          }),
        );
        matched += batch.length;
        batch.length = 0;
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('begin');
        const { rows } = await client.query<ProductIdRow>(
          `update public.products as product
             set detail = incoming.detail
            from jsonb_to_recordset($1::jsonb) as incoming(id bigint, detail jsonb)
           where product.id = incoming.id
           returning product.id`,
          [JSON.stringify(batch)],
        );
        if (rows.length !== batch.length) {
          const updated = new Set(rows.map(({ id }) => Number(id)));
          const missing = batch.map(({ id }) => id).filter((id) => !updated.has(id));
          throw new Error(`No products.id match for productId(s): ${missing.join(', ')}`);
        }
        await client.query('commit');
        matched += batch.length;
        written += rows.length;
        console.log(JSON.stringify({ event: 'batch_written', matched, written, batchSize: rows.length }));
        batch.length = 0;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }

    for await (const document of cursor) {
      if (!Number.isSafeInteger(document.productId) || document.productId <= 0) {
        throw new Error(`Invalid productId in source document ${String(document._id)}`);
      }
      batch.push({ id: document.productId, detail: cleanDocument(document) });
      if (batch.length === BATCH_SIZE) await flush();
    }
    await flush();
    console.log(JSON.stringify({ event: 'sync_complete', filter: FILTER, matched, written, dryRun }));
  } finally {
    await Promise.all([mongo.close(), pool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'sync_failed',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
