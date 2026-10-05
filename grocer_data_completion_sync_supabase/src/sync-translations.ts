import process from "node:process";
import { MongoClient, type Document } from "mongodb";
import { Pool } from "pg";
import {
  ACTIVE_TRANSLATION_COLLECTION,
  ACTIVE_TRANSLATION_LANG,
  BATCH_SIZE,
  EXCLUDED_FIELDS,
  SOURCE_DATABASE,
} from "./config.js";

interface TranslationDocument extends Document {
  productId: number;
  product_name?: unknown;
  detail?: unknown;
  translation?: { status?: unknown };
}

interface TranslationRow {
  product_id: number;
  lang: string;
  name: string;
  detail: Record<string, unknown>;
}

const FILTER = {
  needsReview: false,
  "translation.status": "completed",
};
const dryRun = process.argv.includes("--dry-run");
const limit = readLimit(process.argv);
const mongoUri = requiredEnv("MONGODB_URI");
const postgresUrl = requiredEnv("SUPABASE_DB_URL");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function readLimit(args: string[]): number {
  const index = args.indexOf("--limit");
  if (index === -1) return Infinity;
  const value = Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return value;
}

function cleanTranslationDocument(document: TranslationDocument): Record<string, unknown> {
  const result = Object.fromEntries(
    Object.entries(document).filter(
      ([key]) => !EXCLUDED_FIELDS.has(key) && key !== "translation",
    ),
  );
  if (
    typeof document.product_name !== "string" ||
    !document.product_name.trim() ||
    typeof result.source !== "string" ||
    !result.source ||
    !result.detail ||
    typeof result.detail !== "object" ||
    Array.isArray(result.detail)
  ) {
    throw new Error(
      `Product ${document.productId} has an invalid name, source, or detail object`,
    );
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
      .db(SOURCE_DATABASE)
      .collection<TranslationDocument>(ACTIVE_TRANSLATION_COLLECTION);
    const cursor = collection
      .find(FILTER)
      .sort({ productId: 1, _id: 1 })
      .batchSize(BATCH_SIZE);
    const batch: TranslationDocument[] = [];
    let scanned = 0;
    let written = 0;

    async function flush(): Promise<void> {
      if (!batch.length) return;
      const seenProductIds = new Set<number>();
      for (const document of batch) {
        if (!Number.isSafeInteger(document.productId) || document.productId <= 0) {
          throw new Error(`Invalid productId in source document ${String(document._id)}`);
        }
        if (seenProductIds.has(document.productId)) {
          throw new Error(`Duplicate productId in source batch: ${document.productId}`);
        }
        seenProductIds.add(document.productId);
      }

      const rows: TranslationRow[] = batch.map((document) => {
        const cleaned = cleanTranslationDocument(document);
        const detail = JSON.parse(JSON.stringify(cleaned)) as Record<string, unknown>;
        return {
          product_id: document.productId,
          lang: ACTIVE_TRANSLATION_LANG,
          name: document.product_name as string,
          detail,
        };
      });

      if (dryRun) {
        console.log(
          JSON.stringify({
            event: "translation_batch_preview",
            lang: ACTIVE_TRANSLATION_LANG,
            collection: ACTIVE_TRANSLATION_COLLECTION,
            rows: rows.length,
            productIds: rows.map(({ product_id }) => product_id),
            detailFields: Object.keys(rows[0].detail),
          }),
        );
      } else {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await client.query(
            `insert into public.product_translations (product_id, lang, name, detail)
             select product_id, lang, name, detail
               from jsonb_to_recordset($1::jsonb) as incoming(
                 product_id bigint,
                 lang text,
                 name text,
                 detail jsonb
               )
             on conflict (product_id, lang) do update
               set name = excluded.name,
                   detail = excluded.detail
             returning product_id as id`,
            [JSON.stringify(rows)],
          );
          if (result.rowCount !== rows.length) {
            throw new Error(`Expected ${rows.length} translated rows, wrote ${result.rowCount}`);
          }
          await client.query("commit");
          written += result.rowCount;
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally {
          client.release();
        }
      }

      scanned += batch.length;
      console.log(
        JSON.stringify({
          event: dryRun ? "translation_batch_checked" : "translation_batch_written",
          lang: ACTIVE_TRANSLATION_LANG,
          scanned,
          written,
          batchSize: batch.length,
        }),
      );
      batch.length = 0;
    }

    for await (const document of cursor) {
      if (scanned + batch.length >= limit) break;
      batch.push(document);
      if (batch.length === BATCH_SIZE) await flush();
    }
    await flush();
    console.log(
      JSON.stringify({
        event: "translation_sync_complete",
        lang: ACTIVE_TRANSLATION_LANG,
        collection: ACTIVE_TRANSLATION_COLLECTION,
        filter: FILTER,
        scanned,
        written,
        dryRun,
      }),
    );
  } finally {
    await Promise.all([mongo.close(), pool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "translation_sync_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
