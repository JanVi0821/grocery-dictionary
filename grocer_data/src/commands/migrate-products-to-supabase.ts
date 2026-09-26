/**
 * Grocer 商品迁移至 Supabase。
 *
 * 从 MongoDB 组合 product、barcode、collection member 和 collection hierarchy，
 * 生成 Supabase products 表需要的商品记录。没有 barcode 的商品会被跳过，
 * 其余商品按 grocer_id 批量 upsert，并在成功提交每批数据后更新 checkpoint。
 *
 * 对应命令：npm run migrate:grocer:supabase
 * 默认读取 grocery_dictionary；可用 `--database <name>` 指定其他源数据库。
 */
import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { MongoClient, type Collection, type Document } from "mongodb";
import {
  PROJECT_ROOT,
  databaseArgument,
  errorMessage,
  mongoUri,
  nonNegativeInteger,
  positiveInteger,
  requiredEnv,
} from "../lib/config.js";
import { readJsonIfExists, writeJsonAtomic } from "../lib/files.js";
import {
  addToMap,
  buildParentMap,
  cleanOptionalText,
  expandCollectionIds,
} from "../lib/product-model.js";

interface ProductDocument extends Document {
  id: number;
  name: string;
  brand: string | null;
  unit: string;
  size: string | null;
}

interface BarcodeDocument extends Document {
  product_id: number;
  barcode: string;
}

interface MemberDocument extends Document {
  product_id: number;
  collection_id: number;
}

interface HierarchyDocument extends Document {
  parent_id: number;
  child_id: number;
}

interface MetaDocument extends Document {
  _id: string;
  updated_at: string;
}

interface MigrationCheckpoint {
  source_updated_at: string;
  database?: string;
  last_scanned_grocer_id: number;
  migrated: number;
  skipped_without_barcode: number;
  completed?: boolean;
  completed_at?: string;
}

interface ProductPayload {
  grocer_id: number;
  collection_ids: number[];
  barcodes: string[];
  name: string;
  brand: string | null;
  unit: string;
  size: string | null;
}

interface PendingProduct {
  sourceId: number;
  payload: ProductPayload;
}

const STATE_DIR = path.join(PROJECT_ROOT, ".grocer-products-migration");
const CHECKPOINT_FILE = path.join(STATE_DIR, "checkpoint.json");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const supabaseSecretKey = requiredEnv("SUPABASE_SECRET_KEY");
const batchSize = positiveInteger(process.env.GROCER_MIGRATION_BATCH_SIZE, 100);
const delayMs = nonNegativeInteger(process.env.GROCER_MIGRATION_DELAY_MS, 1000);
const SOURCE_CHUNK_SIZE = 500;
const database = databaseArgument(process.argv.slice(2)) ?? "grocery_dictionary";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readCheckpoint(sourceUpdatedAt: string): Promise<MigrationCheckpoint> {
  const checkpoint = await readJsonIfExists<MigrationCheckpoint>(CHECKPOINT_FILE);
  if (!checkpoint) {
    return {
      source_updated_at: sourceUpdatedAt,
      database,
      last_scanned_grocer_id: 0,
      migrated: 0,
      skipped_without_barcode: 0,
    };
  }
  if (checkpoint.source_updated_at !== sourceUpdatedAt) {
    throw new Error(`Checkpoint source ${checkpoint.source_updated_at} does not match MongoDB source ${sourceUpdatedAt}`);
  }
  if (
    (checkpoint.database && checkpoint.database !== database)
    || (!checkpoint.database && database !== "grocery_dictionary")
  ) {
    return {
      source_updated_at: sourceUpdatedAt,
      database,
      last_scanned_grocer_id: 0,
      migrated: 0,
      skipped_without_barcode: 0,
    };
  }
  checkpoint.database = database;
  return checkpoint;
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: supabaseSecretKey,
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=minimal",
  };
  if (supabaseSecretKey.split(".").length === 3) {
    headers.authorization = `Bearer ${supabaseSecretKey}`;
  }
  return headers;
}

async function saveBatch(rows: readonly ProductPayload[]): Promise<void> {
  const endpoint = `${supabaseUrl}/rest/v1/products?on_conflict=grocer_id`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return;
      const body = await response.text();
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Supabase HTTP ${response.status}: ${body}`);
      }
      throw new Error(`Retryable Supabase HTTP ${response.status}: ${body}`);
    } catch (error: unknown) {
      if (attempt === 5 || errorMessage(error).startsWith("Supabase HTTP")) throw error;
      const waitMs = attempt * 2_000;
      console.warn(`[retry] batch attempt ${attempt} failed; waiting ${waitMs} ms: ${errorMessage(error)}`);
      await sleep(waitMs);
    }
  }
}

async function countEligibleProducts(barcodes: Collection<BarcodeDocument>): Promise<number> {
  const result = await barcodes.aggregate<{ count: number }>([
    { $group: { _id: "$product_id" } },
    { $count: "count" },
  ]).toArray();
  return result[0]?.count ?? 0;
}

async function migrate(): Promise<void> {
  const mongo = new MongoClient(mongoUri());
  await mongo.connect();
  try {
    console.log(`[database] ${database}`);
    const db = mongo.db(database);
    const products = db.collection<ProductDocument>("grocer_public_products");
    const barcodes = db.collection<BarcodeDocument>("grocer_public_barcodes");
    const members = db.collection<MemberDocument>("grocer_public_collection_members");
    const hierarchy = db.collection<HierarchyDocument>("grocer_public_collection_hierarchy");
    const collections = db.collection<{ id: number } & Document>("grocer_public_collections");

    const meta = await db.collection<MetaDocument>("grocer_public_meta").findOne({ _id: "snapshot" });
    if (!meta?.updated_at) throw new Error("grocer_public_meta.updated_at is missing");

    const [hierarchyRows, knownCollectionIds, expectedProducts] = await Promise.all([
      hierarchy.find({}, { projection: { _id: 0, parent_id: 1, child_id: 1 } }).toArray(),
      collections.distinct("id"),
      countEligibleProducts(barcodes),
    ]);
    const knownCollections = new Set(knownCollectionIds);
    for (const edge of hierarchyRows) {
      if (!knownCollections.has(edge.parent_id) || !knownCollections.has(edge.child_id)) {
        throw new Error(`Hierarchy references an unknown collection: ${JSON.stringify(edge)}`);
      }
    }

    const parentsByChild = buildParentMap(hierarchyRows);
    const checkpoint = await readCheckpoint(meta.updated_at);
    let lastScannedId = checkpoint.last_scanned_grocer_id;
    let migrated = checkpoint.migrated;
    let skipped = checkpoint.skipped_without_barcode;
    let pending: PendingProduct[] = [];

    console.log(`[source] updated_at=${meta.updated_at}`);
    console.log(`[source] eligible products=${expectedProducts.toLocaleString()}`);
    console.log(`[resume] last grocer_id=${lastScannedId}, migrated=${migrated.toLocaleString()}`);

    while (true) {
      const sourceProducts = await products.find(
        { id: { $gt: lastScannedId } },
        { projection: { _id: 0, id: 1, name: 1, brand: 1, unit: 1, size: 1 } },
      ).sort({ id: 1 }).limit(SOURCE_CHUNK_SIZE).toArray();
      if (sourceProducts.length === 0) break;

      const productIds = sourceProducts.map(({ id }) => id);
      const [barcodeRows, memberRows] = await Promise.all([
        barcodes.find(
          { product_id: { $in: productIds } },
          { projection: { _id: 0, product_id: 1, barcode: 1 } },
        ).toArray(),
        members.find(
          { product_id: { $in: productIds } },
          { projection: { _id: 0, product_id: 1, collection_id: 1 } },
        ).toArray(),
      ]);
      const barcodesByProduct = new Map<number, string[]>();
      const collectionsByProduct = new Map<number, number[]>();
      for (const row of barcodeRows) addToMap(barcodesByProduct, row.product_id, row.barcode);
      for (const row of memberRows) {
        if (!knownCollections.has(row.collection_id)) {
          throw new Error(`Product ${row.product_id} references unknown collection ${row.collection_id}`);
        }
        addToMap(collectionsByProduct, row.product_id, row.collection_id);
      }

      for (const product of sourceProducts) {
        lastScannedId = product.id;
        const productBarcodes = [...new Set(barcodesByProduct.get(product.id) ?? [])].sort();
        if (productBarcodes.length === 0) {
          skipped += 1;
          continue;
        }

        pending.push({
          sourceId: product.id,
          payload: {
            grocer_id: product.id,
            collection_ids: expandCollectionIds(collectionsByProduct.get(product.id) ?? [], parentsByChild),
            barcodes: productBarcodes,
            name: product.name.trim(),
            brand: cleanOptionalText(product.brand),
            unit: product.unit.trim(),
            size: cleanOptionalText(product.size),
          },
        });

        if (pending.length !== batchSize) continue;
        await saveBatch(pending.map(({ payload }) => payload));
        migrated += pending.length;
        checkpoint.last_scanned_grocer_id = pending.at(-1)?.sourceId ?? lastScannedId;
        checkpoint.migrated = migrated;
        checkpoint.skipped_without_barcode = skipped;
        await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
        pending = [];
        console.log(`[migrate] ${migrated.toLocaleString()} / ${expectedProducts.toLocaleString()}`);
        if (delayMs > 0) await sleep(delayMs);
      }
    }

    if (pending.length > 0) {
      await saveBatch(pending.map(({ payload }) => payload));
      migrated += pending.length;
      console.log(`[migrate] ${migrated.toLocaleString()} / ${expectedProducts.toLocaleString()}`);
    }

    checkpoint.last_scanned_grocer_id = lastScannedId;
    checkpoint.migrated = migrated;
    checkpoint.skipped_without_barcode = skipped;
    checkpoint.completed = true;
    checkpoint.completed_at = new Date().toISOString();
    await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
    console.log(`[done] migrated=${migrated.toLocaleString()}, skipped_without_barcode=${skipped.toLocaleString()}`);
  } finally {
    await mongo.close();
  }
}

function selfTest(): void {
  const parents = buildParentMap([
    { parent_id: 1, child_id: 2 },
    { parent_id: 2, child_id: 4 },
    { parent_id: 2, child_id: 5 },
  ]);
  assert.deepEqual(expandCollectionIds([4, 5], parents), [2, 4, 5]);
  assert.equal(cleanOptionalText("  Brand  "), "Brand");
  assert.equal(cleanOptionalText("  "), null);
  console.log("self-test passed");
}

const command = process.argv[2] ?? "migrate";
try {
  if (command === "self-test") selfTest();
  else if (command === "migrate") await migrate();
  else throw new Error(`Unknown command: ${command}`);
} catch (error: unknown) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
