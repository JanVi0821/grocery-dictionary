/**
 * MongoDB 全量基准同步。
 *
 * 下载 Grocer 最新的公开 DuckDB 快照，将配置的六张源表完整导入 MongoDB
 * 的 `__refresh` 临时 collection。所有记录数量校验通过后，再切换为正式
 * collection；原有 collection 会保留为带时间戳的备份。
 *
 * 对应命令：npm run sync:grocer:mongodb
 * 可通过 `--database <name>` 或 GROCER_FULL_SYNC_DATABASE 指定目标库。
 * 未指定时使用奥克兰当天日期生成 `grocer_data_YYYY-MM-DD`。
 * 可设置 GROCER_SKIP_DOWNLOAD=true 复用本地 base_v3.duckdb，避免重复下载。
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import {
  MongoClient,
  type Collection,
  type Db,
} from "mongodb";
import {
  DATABASE_FILE,
  DEFAULT_SOURCE_URL,
  PROJECT_ROOT,
  databaseArgument,
  defaultFullSyncDatabase,
  errorMessage,
  mongoUri,
  nonNegativeInteger,
  positiveInteger,
  validateMongoDatabaseName,
} from "../lib/config.js";
import { queryDuckDb, streamDuckDbJson, validateDuckDb } from "../lib/duckdb.js";
import { fileExists, readJsonIfExists, writeJsonAtomic } from "../lib/files.js";
import { GROCER_TABLES } from "../lib/grocer-tables.js";
import type { GrocerDocument, GrocerRow, MetaRow, TableSpec } from "../types/grocer.js";

interface FullSyncCheckpoint {
  source_updated_at: string;
  database: string;
  tables: Record<string, { offset: number; expected: number }>;
}

interface DownloadManifest {
  source_url: string;
  downloaded_at: string;
  source_last_modified: string | null;
  source_etag: string | null;
  database_bytes: number;
}

const WORK_DIR = path.join(PROJECT_ROOT, ".grocer-mongodb-sync");
const DOWNLOAD_FILE = path.join(WORK_DIR, "base_v3.duckdb.br.part");
const NEXT_DATABASE_FILE = path.join(WORK_DIR, "base_v3.duckdb.part");
const CHECKPOINT_FILE = path.join(WORK_DIR, "checkpoint.json");
const MANIFEST_FILE = path.join(WORK_DIR, "manifest.json");

interface FullSyncConfig {
  sourceUrl: string;
  mongoUri: string;
  database: string;
  batchSize: number;
  batchDelayMs: number;
  skipDownload: boolean;
}

function loadConfig(args: readonly string[]): FullSyncConfig {
  return {
    sourceUrl: process.env.GROCER_DB_URL ?? DEFAULT_SOURCE_URL,
    mongoUri: mongoUri(),
    database: validateMongoDatabaseName(
      databaseArgument(args)
      ?? process.env.GROCER_FULL_SYNC_DATABASE
      ?? defaultFullSyncDatabase(),
    ),
    batchSize: positiveInteger(process.env.MONGO_BATCH_SIZE, 100),
    batchDelayMs: nonNegativeInteger(process.env.MONGO_BATCH_DELAY_MS, 250),
    skipDownload: process.env.GROCER_SKIP_DOWNLOAD === "true",
  };
}

const config = loadConfig(process.argv.slice(2));

function timestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function downloadDatabase(): Promise<void> {
  console.log(`[download] GET ${config.sourceUrl}`);
  const response = await fetch(config.sourceUrl, { headers: { "cache-control": "no-cache" } });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);

  await rm(DOWNLOAD_FILE, { force: true });
  await rm(NEXT_DATABASE_FILE, { force: true });
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
  }

  if (await fileExists(DATABASE_FILE)) {
    await rename(DATABASE_FILE, path.join(WORK_DIR, `base_v3.previous-${timestamp()}.duckdb`));
  }
  await rename(NEXT_DATABASE_FILE, DATABASE_FILE);
  await rm(DOWNLOAD_FILE, { force: true });

  const fileInfo = await stat(DATABASE_FILE);
  const manifest: DownloadManifest = {
    source_url: config.sourceUrl,
    downloaded_at: new Date().toISOString(),
    source_last_modified: response.headers.get("last-modified"),
    source_etag: response.headers.get("etag"),
    database_bytes: fileInfo.size,
  };
  await writeJsonAtomic(MANIFEST_FILE, manifest);
  console.log(`[download] complete (${fileInfo.size.toLocaleString()} bytes, last modified ${manifest.source_last_modified ?? "unknown"})`);
}

function inspectSource(): Record<string, number> {
  const required = GROCER_TABLES.map(({ source }) => quoteSqlString(source)).join(", ");
  const found = queryDuckDb<{ table_name: string }>(
    DATABASE_FILE,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name IN (${required}) ORDER BY table_name`,
  );
  if (found.length !== GROCER_TABLES.length) {
    throw new Error(`Expected ${GROCER_TABLES.length} source tables, found ${found.length}`);
  }

  return Object.fromEntries(GROCER_TABLES.map(({ source }) => {
    const result = queryDuckDb<{ row_count: number }>(
      DATABASE_FILE,
      `SELECT count(*)::BIGINT AS row_count FROM ${source}`,
    );
    const count = result[0]?.row_count;
    if (count === undefined) throw new Error(`Unable to count ${source}`);
    return [source, Number(count)];
  }));
}

async function loadCheckpoint(sourceUpdatedAt: string): Promise<FullSyncCheckpoint> {
  const checkpoint = await readJsonIfExists<FullSyncCheckpoint>(CHECKPOINT_FILE);
  if (
    checkpoint?.source_updated_at === sourceUpdatedAt
    && checkpoint.database === config.database
  ) return checkpoint;
  return { source_updated_at: sourceUpdatedAt, database: config.database, tables: {} };
}

async function insertBatch(
  collection: Collection<GrocerDocument>,
  documents: GrocerDocument[],
): Promise<void> {
  if (documents.length === 0) return;
  try {
    await collection.insertMany(documents, { ordered: false });
  } catch (error: unknown) {
    if (!containsOnlyDuplicateWriteErrors(error)) throw error;
  }
}

function containsOnlyDuplicateWriteErrors(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("writeErrors" in error)) return false;
  const rawErrors: unknown = error.writeErrors;
  const writeErrors = Array.isArray(rawErrors) ? rawErrors : [rawErrors];
  return writeErrors.length > 0 && writeErrors.every((item: unknown) => (
    typeof item === "object"
    && item !== null
    && "code" in item
    && item.code === 11000
  ));
}

async function importTable(
  db: Db,
  table: TableSpec,
  expectedCount: number,
  checkpoint: FullSyncCheckpoint,
): Promise<void> {
  const stageName = `${table.target}__refresh`;
  const stage = db.collection<GrocerDocument>(stageName);
  const savedOffset = checkpoint.tables[table.source]?.offset ?? 0;
  const currentCount = await stage.countDocuments();
  let offset = savedOffset;

  if (currentCount !== savedOffset) {
    console.log(`[resume] ${table.source}: staging count ${currentCount} differs from checkpoint ${savedOffset}; using staging count`);
    offset = currentCount;
  }
  if (offset > expectedCount) {
    try {
      await stage.drop();
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("codeName" in error) || error.codeName !== "NamespaceNotFound") throw error;
    }
    offset = 0;
  }

  const source = streamDuckDbJson(
    DATABASE_FILE,
    `SELECT * FROM ${table.source} ORDER BY ${table.orderBy}`,
    table.source,
  );
  let lineNumber = 0;
  let batch: GrocerDocument[] = [];

  for await (const line of source.lines) {
    if (lineNumber++ < offset) continue;
    const row = JSON.parse(line) as GrocerRow;
    batch.push({ _id: table.id(row), ...row });
    if (batch.length < config.batchSize) continue;

    await insertBatch(stage, batch);
    offset += batch.length;
    batch = [];
    checkpoint.tables[table.source] = { offset, expected: expectedCount };
    await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
    console.log(`[import] ${table.target}: ${offset.toLocaleString()} / ${expectedCount.toLocaleString()}`);
    if (config.batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.batchDelayMs));
    }
  }

  if (batch.length > 0) {
    await insertBatch(stage, batch);
    offset += batch.length;
    checkpoint.tables[table.source] = { offset, expected: expectedCount };
    await writeJsonAtomic(CHECKPOINT_FILE, checkpoint);
    console.log(`[import] ${table.target}: ${offset.toLocaleString()} / ${expectedCount.toLocaleString()}`);
  }

  await source.done;
  const actualCount = await stage.countDocuments();
  if (actualCount !== expectedCount) {
    throw new Error(`${stageName}: expected ${expectedCount}, found ${actualCount}`);
  }
}

async function swapCollections(db: Db): Promise<string[]> {
  const suffix = timestamp();
  const backups: Array<{ target: string; backup: string }> = [];
  try {
    for (const { target } of GROCER_TABLES) {
      const existing = await db.listCollections({ name: target }, { nameOnly: true }).hasNext();
      if (!existing) continue;
      const backup = `${target}__backup_${suffix}`;
      await db.collection(target).rename(backup);
      backups.push({ target, backup });
    }
    for (const { target } of GROCER_TABLES) {
      await db.collection(`${target}__refresh`).rename(target);
    }
  } catch (error: unknown) {
    for (const { target, backup } of backups.reverse()) {
      const targetExists = await db.listCollections({ name: target }, { nameOnly: true }).hasNext();
      if (targetExists) await db.collection(target).drop();
      await db.collection(backup).rename(target);
    }
    throw error;
  }
  return backups.map(({ backup }) => backup);
}

async function main(): Promise<void> {
  await mkdir(WORK_DIR, { recursive: true });
  if (config.skipDownload) {
    if (!(await fileExists(DATABASE_FILE))) {
      throw new Error(`Cannot skip download: ${DATABASE_FILE} does not exist`);
    }
    console.log(`[download] skipped; using ${DATABASE_FILE}`);
  } else {
    await downloadDatabase();
  }

  const counts = inspectSource();
  const sourceUpdatedAt = queryDuckDb<MetaRow>(
    DATABASE_FILE,
    "SELECT updated_at::VARCHAR AS updated_at FROM public_meta LIMIT 1",
  )[0]?.updated_at;
  if (!sourceUpdatedAt) throw new Error("Downloaded database has no public_meta.updated_at");

  console.log(`[source] updated_at=${sourceUpdatedAt}`);
  for (const table of GROCER_TABLES) {
    console.log(`[source] ${table.source}: ${(counts[table.source] ?? 0).toLocaleString()} rows`);
  }

  const client = new MongoClient(config.mongoUri);
  await client.connect();
  try {
    const databaseExists = (await client.db().admin().listDatabases({ nameOnly: true }))
      .databases
      .some(({ name }) => name === config.database);
    console.log(`[database] ${config.database} (${databaseExists ? "existing" : "will be created"})`);
    const db = client.db(config.database);
    const checkpoint = await loadCheckpoint(sourceUpdatedAt);
    for (const table of GROCER_TABLES) {
      await importTable(db, table, counts[table.source] ?? 0, checkpoint);
    }
    const backups = await swapCollections(db);
    await rm(CHECKPOINT_FILE, { force: true });

    console.log("[verify] final MongoDB counts");
    for (const table of GROCER_TABLES) {
      const count = await db.collection(table.target).countDocuments();
      console.log(`[verify] ${table.target}: ${count.toLocaleString()}`);
    }
    console.log(`[done] previous collections retained as backups: ${backups.join(", ") || "none"}`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
