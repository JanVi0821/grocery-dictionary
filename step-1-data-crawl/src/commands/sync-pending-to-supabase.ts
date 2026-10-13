/**
 * 将 MongoDB 中尚未处理的 Grocer 变更同步到 Supabase products。
 *
 * 脚本读取 products、barcodes 和 collection_members 中 `_sync.status=pending`
 * 的记录，按受影响的 product_id 重建当前商品状态。Supabase 批次成功后才将
 * 对应 MongoDB `_sync` 标为 processed，因此中断后可以安全重试。所有批次
 * 完成后，删除带删除标记的源文档，并移除其余文档的 `_sync`，形成新基准。
 *
 * 对应命令：npm run sync:grocer:supabase
 * 默认读取 grocery_dictionary；可用 `--database <name>` 指定其他源数据库。
 */
import assert from "node:assert/strict";
import process from "node:process";
import {
  MongoClient,
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
  type Document,
} from "mongodb";
import {
  databaseArgument,
  dateInAuckland,
  errorMessage,
  mongoUri,
  nonNegativeInteger,
  positiveInteger,
  requiredEnv,
} from "../lib/config.js";
import {
  addToMap,
  buildParentMap,
  cleanOptionalText,
  expandCollectionIds,
  type HierarchyEdge,
} from "../lib/product-model.js";
import {
  SupabaseProductsApi,
  type SupabaseProductPayload,
} from "../lib/supabase-products.js";
import type { SyncMetadata } from "../types/grocer.js";

const SOURCE_COLLECTIONS = [
  "grocer_public_products",
  "grocer_public_barcodes",
  "grocer_public_collection_members",
] as const;

type SourceCollectionName = (typeof SOURCE_COLLECTIONS)[number];

interface SyncDocument extends Document {
  _id: string;
  _sync?: SyncMetadata;
}

interface ProductDocument extends SyncDocument {
  id: number;
  name: string;
  brand: string | null;
  unit: string;
  size: string | null;
}

interface BarcodeDocument extends SyncDocument {
  product_id: number;
  barcode: string;
}

interface MemberDocument extends SyncDocument {
  product_id: number;
  collection_id: number;
}

interface HierarchyDocument extends SyncDocument, HierarchyEdge {}

interface PendingReference {
  collection: SourceCollectionName;
  id: string;
  batchId: string;
}

interface BatchResult {
  upserted: number;
  deleted: number;
  skippedWithoutBarcode: number;
}

interface CleanupResult {
  collection: SourceCollectionName;
  deletedDocuments: number;
  normalizedDocuments: number;
}

interface CurrentProductState {
  id: number;
  name: string;
  brand: string | null;
  unit: string;
  size: string | null;
  deleted: boolean;
}

type ProductAction =
  | { kind: "delete"; grocerId: number }
  | { kind: "skip-without-barcode" }
  | { kind: "upsert"; payload: SupabaseProductPayload };

const database = databaseArgument(process.argv.slice(2)) ?? "grocery_dictionary";
const batchSize = positiveInteger(process.env.GROCER_SUPABASE_SYNC_BATCH_SIZE, 100);
const delayMs = nonNegativeInteger(process.env.GROCER_SUPABASE_SYNC_DELAY_MS, 1000);
const supabase = new SupabaseProductsApi(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SECRET_KEY"),
);

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function addReference(
  referencesByProduct: Map<number, PendingReference[]>,
  productId: number,
  reference: PendingReference,
): void {
  addToMap(referencesByProduct, productId, reference);
}

export function buildProductAction(
  product: CurrentProductState,
  barcodes: readonly string[],
  directCollectionIds: readonly number[],
  parentsByChild: ReadonlyMap<number, ReadonlySet<number>>,
  alreadyExists: boolean,
  updateDate: string,
): ProductAction {
  if (product.deleted) return { kind: "delete", grocerId: product.id };

  const normalizedBarcodes = [...new Set(barcodes)].sort();
  if (normalizedBarcodes.length === 0 && !alreadyExists) {
    return { kind: "skip-without-barcode" };
  }

  return {
    kind: "upsert",
    payload: {
      grocer_id: product.id,
      collection_ids: expandCollectionIds(directCollectionIds, parentsByChild),
      barcodes: normalizedBarcodes,
      name: product.name.trim(),
      brand: cleanOptionalText(product.brand),
      unit: product.unit.trim(),
      size: cleanOptionalText(product.size),
      deleted_from_grocer: false,
      update_at_from_grocer: updateDate,
    },
  };
}

async function collectPendingReferences(db: Db): Promise<Map<number, PendingReference[]>> {
  const referencesByProduct = new Map<number, PendingReference[]>();

  const productCursor = db.collection<ProductDocument>(SOURCE_COLLECTIONS[0]).find(
    { "_sync.status": "pending" },
    { projection: { _id: 1, id: 1, "_sync.batch_id": 1 } },
  );
  for await (const document of productCursor) {
    const batchId = document._sync?.batch_id;
    if (!batchId) throw new Error(`Pending product ${document._id} has no _sync.batch_id`);
    addReference(referencesByProduct, document.id, {
      collection: SOURCE_COLLECTIONS[0],
      id: document._id,
      batchId,
    });
  }

  const barcodeCursor = db.collection<BarcodeDocument>(SOURCE_COLLECTIONS[1]).find(
    { "_sync.status": "pending" },
    { projection: { _id: 1, product_id: 1, "_sync.batch_id": 1 } },
  );
  for await (const document of barcodeCursor) {
    const batchId = document._sync?.batch_id;
    if (!batchId) throw new Error(`Pending barcode ${document._id} has no _sync.batch_id`);
    addReference(referencesByProduct, document.product_id, {
      collection: SOURCE_COLLECTIONS[1],
      id: document._id,
      batchId,
    });
  }

  const memberCursor = db.collection<MemberDocument>(SOURCE_COLLECTIONS[2]).find(
    { "_sync.status": "pending" },
    { projection: { _id: 1, product_id: 1, "_sync.batch_id": 1 } },
  );
  for await (const document of memberCursor) {
    const batchId = document._sync?.batch_id;
    if (!batchId) throw new Error(`Pending collection member ${document._id} has no _sync.batch_id`);
    addReference(referencesByProduct, document.product_id, {
      collection: SOURCE_COLLECTIONS[2],
      id: document._id,
      batchId,
    });
  }

  return referencesByProduct;
}

async function loadParentMap(db: Db): Promise<Map<number, Set<number>>> {
  const rows = await db.collection<HierarchyDocument>("grocer_public_collection_hierarchy").find(
    { "_sync.deleted": { $ne: true } },
    { projection: { _id: 0, parent_id: 1, child_id: 1 } },
  ).toArray();
  return buildParentMap(rows);
}

async function markReferencesProcessed(
  db: Db,
  references: readonly PendingReference[],
): Promise<void> {
  const processedAt = new Date().toISOString();
  for (const collectionName of SOURCE_COLLECTIONS) {
    const operations: AnyBulkWriteOperation<SyncDocument>[] = references
      .filter(({ collection }) => collection === collectionName)
      .map((reference) => ({
        updateOne: {
          filter: {
            _id: reference.id,
            "_sync.status": "pending",
            "_sync.batch_id": reference.batchId,
          },
          update: {
            $set: {
              "_sync.status": "processed",
              "_sync.processed_at": processedAt,
            },
          },
        },
      }));
    if (operations.length > 0) {
      await db.collection<SyncDocument>(collectionName).bulkWrite(operations, { ordered: true });
    }
  }
}

async function cleanupProcessedChanges(db: Db): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  for (const collectionName of SOURCE_COLLECTIONS) {
    const collection = db.collection<SyncDocument>(collectionName);
    const deleted = await collection.deleteMany({
      "_sync.status": "processed",
      "_sync.deleted": true,
    });
    const normalized = await collection.updateMany(
      {
        "_sync.status": "processed",
        "_sync.deleted": { $ne: true },
      },
      { $unset: { _sync: "" } },
    );
    results.push({
      collection: collectionName,
      deletedDocuments: deleted.deletedCount,
      normalizedDocuments: normalized.modifiedCount,
    });
  }
  return results;
}

function logCleanup(results: readonly CleanupResult[]): void {
  console.log("[cleanup] processed MongoDB changes converted into baseline data");
  for (const result of results) {
    console.log(
      `[cleanup] ${result.collection}`
      + `: deleted=${result.deletedDocuments.toLocaleString()}`
      + `, normalized=${result.normalizedDocuments.toLocaleString()}`,
    );
  }
}

async function processBatch(
  db: Db,
  productIds: readonly number[],
  referencesByProduct: ReadonlyMap<number, readonly PendingReference[]>,
  parentsByChild: ReadonlyMap<number, ReadonlySet<number>>,
  updateDate: string,
): Promise<BatchResult> {
  const [products, barcodeRows, memberRows, existingGrocerIds] = await Promise.all([
    db.collection<ProductDocument>(SOURCE_COLLECTIONS[0]).find(
      { id: { $in: productIds } },
      { projection: { id: 1, name: 1, brand: 1, unit: 1, size: 1, _sync: 1 } },
    ).toArray(),
    db.collection<BarcodeDocument>(SOURCE_COLLECTIONS[1]).find(
      { product_id: { $in: productIds }, "_sync.deleted": { $ne: true } },
      { projection: { _id: 0, product_id: 1, barcode: 1 } },
    ).toArray(),
    db.collection<MemberDocument>(SOURCE_COLLECTIONS[2]).find(
      { product_id: { $in: productIds }, "_sync.deleted": { $ne: true } },
      { projection: { _id: 0, product_id: 1, collection_id: 1 } },
    ).toArray(),
    supabase.existingGrocerIds(productIds),
  ]);

  const productsById = new Map(products.map((product) => [product.id, product]));
  const barcodesByProduct = new Map<number, string[]>();
  const collectionsByProduct = new Map<number, number[]>();
  for (const row of barcodeRows) addToMap(barcodesByProduct, row.product_id, row.barcode);
  for (const row of memberRows) addToMap(collectionsByProduct, row.product_id, row.collection_id);

  const deletedIds: number[] = [];
  const upserts: SupabaseProductPayload[] = [];
  let skippedWithoutBarcode = 0;

  for (const productId of productIds) {
    const product = productsById.get(productId);
    if (!product) throw new Error(`Pending change references missing product ${productId}`);
    const action = buildProductAction(
      {
        id: product.id,
        name: product.name,
        brand: product.brand,
        unit: product.unit,
        size: product.size,
        deleted: product._sync?.deleted === true,
      },
      barcodesByProduct.get(productId) ?? [],
      collectionsByProduct.get(productId) ?? [],
      parentsByChild,
      existingGrocerIds.has(productId),
      updateDate,
    );
    if (action.kind === "delete") deletedIds.push(action.grocerId);
    else if (action.kind === "upsert") upserts.push(action.payload);
    else skippedWithoutBarcode += 1;
  }

  await supabase.markDeleted(deletedIds, updateDate);
  await supabase.upsert(upserts);

  const references = productIds.flatMap((productId) => referencesByProduct.get(productId) ?? []);
  await markReferencesProcessed(db, references);

  return {
    upserted: upserts.length,
    deleted: deletedIds.length,
    skippedWithoutBarcode,
  };
}

async function sync(): Promise<void> {
  const client = new MongoClient(mongoUri());
  await client.connect();
  try {
    console.log(`[database] ${database}`);
    const db = client.db(database);
    const [referencesByProduct, parentsByChild] = await Promise.all([
      collectPendingReferences(db),
      loadParentMap(db),
    ]);
    const productIds = [...referencesByProduct.keys()].sort((left, right) => left - right);
    const updateDate = dateInAuckland();

    console.log(`[pending] affected products=${productIds.length.toLocaleString()}`);
    if (productIds.length === 0) {
      const cleanup = await cleanupProcessedChanges(db);
      logCleanup(cleanup);
      console.log("[done] no pending product changes; processed cleanup completed");
      return;
    }

    let processed = 0;
    let upserted = 0;
    let deleted = 0;
    let skippedWithoutBarcode = 0;
    for (let index = 0; index < productIds.length; index += batchSize) {
      const ids = productIds.slice(index, index + batchSize);
      const result = await processBatch(
        db,
        ids,
        referencesByProduct,
        parentsByChild,
        updateDate,
      );
      processed += ids.length;
      upserted += result.upserted;
      deleted += result.deleted;
      skippedWithoutBarcode += result.skippedWithoutBarcode;
      console.log(
        `[sync] ${processed.toLocaleString()} / ${productIds.length.toLocaleString()}`
        + `; upserted=${upserted.toLocaleString()}`
        + `; deleted=${deleted.toLocaleString()}`
        + `; skipped_without_barcode=${skippedWithoutBarcode.toLocaleString()}`,
      );
      if (delayMs > 0 && processed < productIds.length) await sleep(delayMs);
    }

    const cleanup = await cleanupProcessedChanges(db);
    logCleanup(cleanup);

    console.log(
      `[done] processed=${processed.toLocaleString()}`
      + `, upserted=${upserted.toLocaleString()}`
      + `, deleted=${deleted.toLocaleString()}`
      + `, skipped_without_barcode=${skippedWithoutBarcode.toLocaleString()}`,
    );
  } finally {
    await client.close();
  }
}

function selfTest(): void {
  const parents = buildParentMap([
    { parent_id: 1, child_id: 2 },
    { parent_id: 2, child_id: 4 },
  ]);
  assert.deepEqual(expandCollectionIds([4], parents), [2, 4]);
  assert.equal(cleanOptionalText(" Brand "), "Brand");
  assert.equal(cleanOptionalText(" "), null);

  const baseProduct: CurrentProductState = {
    id: 10,
    name: " Product ",
    brand: " Brand ",
    unit: " each ",
    size: null,
    deleted: false,
  };
  assert.deepEqual(
    buildProductAction(baseProduct, ["2", "1", "2"], [4], parents, false, "2026-09-26"),
    {
      kind: "upsert",
      payload: {
        grocer_id: 10,
        collection_ids: [2, 4],
        barcodes: ["1", "2"],
        name: "Product",
        brand: "Brand",
        unit: "each",
        size: null,
        deleted_from_grocer: false,
        update_at_from_grocer: "2026-09-26",
      },
    },
  );
  assert.deepEqual(
    buildProductAction({ ...baseProduct, deleted: true }, ["1"], [], parents, true, "2026-09-26"),
    { kind: "delete", grocerId: 10 },
  );
  assert.deepEqual(
    buildProductAction(baseProduct, [], [], parents, false, "2026-09-26"),
    { kind: "skip-without-barcode" },
  );
  const existingWithoutBarcode = buildProductAction(
    baseProduct,
    [],
    [],
    parents,
    true,
    "2026-09-26",
  );
  assert.equal(existingWithoutBarcode.kind, "upsert");
  if (existingWithoutBarcode.kind === "upsert") {
    assert.deepEqual(existingWithoutBarcode.payload.barcodes, []);
  }
  console.log("self-test passed");
}

const command = process.argv[2] ?? "sync";
try {
  if (command === "self-test") selfTest();
  else if (command === "sync") await sync();
  else throw new Error(`Unknown command: ${command}`);
} catch (error: unknown) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
