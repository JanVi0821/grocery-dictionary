/**
 * MongoDB 增量差异同步。
 *
 * 获取 Grocer 最新 DuckDB 快照，并与 MongoDB 中现有的六个 collection
 * 逐行比较。新增、修改、恢复和删除的数据不会被直接移除，而是写入 `_sync`
 * 标记，交给后续处理流程消费；同步进度按批次保存到 checkpoint。
 *
 * 对应命令：npm run sync:grocer:incremental
 * 默认操作 grocery_dictionary；可用 `--database <name>` 指定其他数据库。
 */
import assert from "node:assert/strict";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import {
  MongoClient,
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
} from "mongodb";
import {
  DATABASE_FILE,
  DEFAULT_SOURCE_URL,
  PROJECT_ROOT,
  databaseArgument,
  errorMessage,
  mongoUri,
  positiveInteger,
} from "../lib/config.js";
import { queryDuckDb, streamDuckDbJson, validateDuckDb } from "../lib/duckdb.js";
import { fileExists, readJsonIfExists, writeJsonAtomic } from "../lib/files.js";
import { GROCER_TABLES } from "../lib/grocer-tables.js";
import type {
  ChangeType,
  GrocerDocument,
  GrocerRow,
  MetaRow,
  SyncMetadata,
  TableSpec,
} from "../types/grocer.js";

type Comparable = string | number;

interface TableSyncState {
  last_key: Comparable[] | null;
  inserted: number;
  updated: number;
  deleted: number;
  completed?: boolean;
}

interface IncrementalCheckpoint {
  source_updated_at: string;
  database?: string;
  batch_id: string;
  started_at: string;
  completed: boolean;
  completed_at?: string;
  tables: Record<string, TableSyncState>;
}

interface DownloadState {
  etag?: string | null;
  last_modified?: string | null;
  checked_at?: string;
}

interface SyncContext {
  sourceUpdatedAt: string;
  batchId: string;
}

const WORK_DIR = path.join(PROJECT_ROOT, ".grocer-incremental-sync");
const DOWNLOAD_FILE = path.join(WORK_DIR, "base_v3.download");
const NEXT_DATABASE_FILE = path.join(WORK_DIR, "base_v3.next.duckdb");
const PREVIOUS_DATABASE_FILE = path.join(WORK_DIR, "base_v3.previous.duckdb");
const CHECKPOINT_FILE = path.join(WORK_DIR, "checkpoint.json");
const DOWNLOAD_STATE_FILE = path.join(WORK_DIR, "download-state.json");

const sourceUrl = process.env.GROCER_DB_URL ?? DEFAULT_SOURCE_URL;
const batchSize = positiveInteger(process.env.GROCER_INCREMENTAL_BATCH_SIZE, 500);
const database = databaseArgument(process.argv.slice(2)) ?? "grocery_dictionary";

async function downloadDatabase(): Promise<string> {
  await mkdir(WORK_DIR, { recursive: true });
  await rm(DOWNLOAD_FILE, { force: true });
  await rm(NEXT_DATABASE_FILE, { force: true });

  const downloadState = await readJsonIfExists<DownloadState>(DOWNLOAD_STATE_FILE) ?? {};
  const headers: Record<string, string> = { "cache-control": "no-cache" };
  if (await fileExists(DATABASE_FILE)) {
    if (downloadState.etag) headers["if-none-match"] = downloadState.etag;
    if (downloadState.last_modified) headers["if-modified-since"] = downloadState.last_modified;
  }

  console.log(`[download] GET ${sourceUrl}`);
  const response = await fetch(sourceUrl, { headers });
  if (response.status === 304) {
    const sourceUpdatedAt = readSourceUpdatedAt();
    console.log(`[download] unchanged; source updated_at=${sourceUpdatedAt}`);
    return sourceUpdatedAt;
  }
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(DOWNLOAD_FILE),
  );

  try {
    validateDuckDb(DOWNLOAD_FILE);
    await rename(DOWNLOAD_FILE, NEXT_DATABASE_FILE);
  } catch {
    await pipeline(
      createReadStream(DOWNLOAD_FILE),
      createBrotliDecompress(),
      createWriteStream(NEXT_DATABASE_FILE),
    );
    validateDuckDb(NEXT_DATABASE_FILE);
    await rm(DOWNLOAD_FILE, { force: true });
  }

  if (await fileExists(DATABASE_FILE)) {
    await rm(PREVIOUS_DATABASE_FILE, { force: true });
    await rename(DATABASE_FILE, PREVIOUS_DATABASE_FILE);
  }
  await rename(NEXT_DATABASE_FILE, DATABASE_FILE);
  const sourceUpdatedAt = readSourceUpdatedAt();
  await writeJsonAtomic(DOWNLOAD_STATE_FILE, {
    etag: response.headers.get("etag"),
    last_modified: response.headers.get("last-modified"),
    checked_at: new Date().toISOString(),
  } satisfies DownloadState);
  console.log(`[download] source updated_at=${sourceUpdatedAt}`);
  return sourceUpdatedAt;
}

function readSourceUpdatedAt(): string {
  const sourceUpdatedAt = queryDuckDb<MetaRow>(
    DATABASE_FILE,
    "SELECT updated_at::VARCHAR AS updated_at FROM public_meta LIMIT 1",
  )[0]?.updated_at;
  if (!sourceUpdatedAt) throw new Error("Downloaded database has no public_meta.updated_at");
  return sourceUpdatedAt;
}

async function loadCheckpoint(sourceUpdatedAt: string): Promise<IncrementalCheckpoint> {
  const checkpoint = await readJsonIfExists<IncrementalCheckpoint>(CHECKPOINT_FILE);
  if (
    checkpoint?.source_updated_at === sourceUpdatedAt
    && (checkpoint.database === database || (!checkpoint.database && database === "grocery_dictionary"))
  ) {
    checkpoint.database = database;
    return checkpoint;
  }
  return {
    source_updated_at: sourceUpdatedAt,
    database,
    batch_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    completed: false,
    tables: {},
  };
}

export function compareKeys(left: Comparable[], right: Comparable[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) {
      return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
    }
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      if (leftValue < rightValue) return -1;
      if (leftValue > rightValue) return 1;
    } else {
      const result = String(leftValue).localeCompare(String(rightValue));
      if (result !== 0) return result < 0 ? -1 : 1;
    }
  }
  return 0;
}

export function sourceChanged(
  existing: GrocerDocument | undefined,
  row: GrocerRow,
  fields: readonly string[],
): boolean {
  if (existing?._sync?.deleted) return true;
  return fields.some((field) => existing?.[field] !== row[field]);
}

export function fetchedDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

function syncMetadata(
  sourceUpdatedAt: string,
  batchId: string,
  changeType: ChangeType,
): SyncMetadata {
  return {
    status: "pending",
    change_type: changeType,
    source_updated_at: sourceUpdatedAt,
    batch_id: batchId,
    fetched_at: fetchedDate(),
    processed_at: null,
    deleted: changeType === "delete",
  };
}

async function applyBatch(
  collection: Collection<GrocerDocument>,
  spec: TableSpec,
  rows: GrocerRow[],
  context: SyncContext,
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const ids = rows.map((row) => spec.id(row));
  const existingRows = await collection.find({ _id: { $in: ids } }).toArray();
  const existingById = new Map(existingRows.map((row) => [row._id, row]));
  const operations: AnyBulkWriteOperation<GrocerDocument>[] = [];
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const id = spec.id(row);
    const existing = existingById.get(id);
    if (!existing) {
      operations.push({ insertOne: { document: {
        _id: id,
        ...row,
        _sync: syncMetadata(context.sourceUpdatedAt, context.batchId, "insert"),
      } } });
      inserted += 1;
    } else if (sourceChanged(existing, row, spec.fields)) {
      const changeType: ChangeType = existing._sync?.deleted ? "restore" : "update";
      operations.push({ updateOne: {
        filter: { _id: id },
        update: { $set: {
          ...row,
          _sync: syncMetadata(context.sourceUpdatedAt, context.batchId, changeType),
        } },
      } });
      updated += 1;
    }
  }

  if (operations.length > 0) await collection.bulkWrite(operations, { ordered: true });
  return { inserted, updated };
}

async function markDeleted(
  collection: Collection<GrocerDocument>,
  seenIds: Set<string>,
  context: SyncContext,
): Promise<number> {
  let deleted = 0;
  let operations: AnyBulkWriteOperation<GrocerDocument>[] = [];
  const cursor = collection.find(
    { "_sync.deleted": { $ne: true } },
    { projection: { _id: 1 } },
  );
  for await (const document of cursor) {
    if (seenIds.has(document._id)) continue;
    operations.push({ updateOne: {
      filter: { _id: document._id },
      update: { $set: { _sync: syncMetadata(context.sourceUpdatedAt, context.batchId, "delete") } },
    } });
    if (operations.length < batchSize) continue;
    await collection.bulkWrite(operations, { ordered: true });
    deleted += operations.length;
    operations = [];
  }
  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: true });
    deleted += operations.length;
  }
  return deleted;
}

function rowKey(row: GrocerRow, fields: readonly string[]): Comparable[] {
  return fields.map((field) => {
    const value = row[field];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`Unsupported key ${field}: ${String(value)}`);
    }
    return value;
  });
}

async function syncTable(
  db: Db,
  spec: TableSpec,
  checkpoint: IncrementalCheckpoint,
  context: SyncContext,
): Promise<void> {
  const state = checkpoint.tables[spec.source] ?? {
    last_key: null,
    inserted: 0,
    updated: 0,
    deleted: 0,
  };
  if (state.completed) {
    console.log(`[skip] ${spec.source} already completed`);
    return;
  }

  const collection = db.collection<GrocerDocument>(spec.target);
  const seenIds = new Set<string>();
  const source = streamDuckDbJson(
    DATABASE_FILE,
    `SELECT * FROM ${spec.source} ORDER BY ${spec.orderBy}`,
    spec.source,
  );
  let rows: GrocerRow[] = [];

  async function flush(): Promise<void> {
    if (rows.length === 0) return;
    const currentRows = rows;
    rows = [];
    const result = await applyBatch(collection, spec, currentRows, context);
    state.inserted += result.inserted;
    state.updated += result.updated;
    const lastRow = currentRows.at(-1);
    if (!lastRow) throw new Error(`${spec.source}: empty batch`);
    state.last_key = rowKey(lastRow, spec.keyFields);
    checkpoint.tables[spec.source] = state;
    await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
  }

  for await (const line of source.lines) {
    const row = JSON.parse(line) as GrocerRow;
    const id = spec.id(row);
    seenIds.add(id);
    const key = rowKey(row, spec.keyFields);
    if (state.last_key && compareKeys(key, state.last_key) <= 0) continue;
    rows.push(row);
    if (rows.length === batchSize) await flush();
  }
  await flush();
  await source.done;

  state.deleted += await markDeleted(collection, seenIds, context);
  state.completed = true;
  checkpoint.tables[spec.source] = state;
  await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
  console.log(`[sync] ${spec.target}: inserted=${state.inserted}, updated=${state.updated}, deleted=${state.deleted}`);
}

async function ensurePendingIndexes(db: Db): Promise<void> {
  await Promise.all(GROCER_TABLES.map((spec) => db.collection(spec.target).createIndex(
    { "_sync.status": 1, "_sync.batch_id": 1 },
    {
      name: "sync_pending_idx",
      partialFilterExpression: { "_sync.status": "pending" },
    },
  )));
}

async function sync(): Promise<void> {
  const sourceUpdatedAt = await downloadDatabase();
  const checkpoint = await loadCheckpoint(sourceUpdatedAt);
  const client = new MongoClient(mongoUri());
  await client.connect();
  try {
    console.log(`[database] ${database}`);
    const db = client.db(database);
    await ensurePendingIndexes(db);
    if (checkpoint.completed) {
      console.log(`[done] source ${sourceUpdatedAt} was already synchronized`);
      return;
    }
    const context = { sourceUpdatedAt, batchId: checkpoint.batch_id };
    for (const spec of GROCER_TABLES) await syncTable(db, spec, checkpoint, context);
    checkpoint.completed = true;
    checkpoint.completed_at = new Date().toISOString();
    await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
    console.log(`[done] batch_id=${checkpoint.batch_id}`);
  } finally {
    await client.close();
  }
}

function selfTest(): void {
  assert.equal(compareKeys([1, 2], [1, 3]), -1);
  assert.equal(compareKeys(["a", 2], ["a", 2]), 0);
  assert.equal(sourceChanged({ _id: "1", id: 1, name: "same" }, { id: 1, name: "same" }, ["id", "name"]), false);
  assert.equal(sourceChanged({ _id: "1", id: 1, name: "old" }, { id: 1, name: "new" }, ["id", "name"]), true);
  assert.equal(sourceChanged({ _id: "1", id: 1, _sync: syncMetadata("source", "batch", "delete") }, { id: 1 }, ["id"]), true);
  assert.equal(fetchedDate(new Date("2026-09-25T12:30:00Z")), "2026-09-26");
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
