/** 按配置 filter 读取当前匹配记录；重复执行覆盖已有结果，不以最大 ID 跳过历史记录。 */
import { MongoClient } from "mongodb";
import { Pool } from "pg";
import {
  BATCH_SIZE,
  SOURCE_DATABASE,
  SOURCE_COLLECTION,
  FILTER,
} from "./config.ts";
import { readLimit } from "@grocery/pipeline-infra/cli";
import {
  cleanDocument,
  type SourceCompletion,
  type SyncRow,
} from "@grocery/product-model/completion";
import { writeProductsBatch } from "@grocery/pipeline-infra/publish";

const limit = readLimit(process.argv.slice(2));
async function main() {
  const mongoUri = process.env.MONGODB_URI?.trim();
  const postgresUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!mongoUri || !postgresUrl)
    throw new Error("MONGODB_URI / SUPABASE_DB_URL missing");
  const mongo = new MongoClient(mongoUri);
  const pool = new Pool({
    connectionString: postgresUrl,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await mongo.connect();
    const cursor = mongo
      .db(SOURCE_DATABASE)
      .collection<SourceCompletion>(SOURCE_COLLECTION)
      .find(FILTER)
      .sort({ productId: 1, _id: 1 })
      .batchSize(BATCH_SIZE);
    if (limit !== Infinity) cursor.limit(limit);
    let written = 0;
    let previousProductId: number | undefined;
    const batch: SyncRow[] = [];
    async function flush() {
      if (!batch.length) return;
      written += await writeProductsBatch(pool, batch);
      console.log(
        JSON.stringify({
          event: "batch_written",
          written,
          batchSize: batch.length,
        }),
      );
      batch.length = 0;
    }
    try {
      for await (const document of cursor) {
        const detail = cleanDocument(document);
        if (document.productId === previousProductId)
          throw new Error(`Duplicate productId: ${document.productId}`);
        previousProductId = document.productId;
        batch.push({ id: document.productId, detail });
        if (batch.length === BATCH_SIZE) await flush();
      }
      await flush();
    } finally {
      await cursor.close();
    }
    console.log(
      JSON.stringify({
        event: "sync_complete",
        collection: SOURCE_COLLECTION,
        filter: FILTER,
        written,
      }),
    );
  } finally {
    const closed = await Promise.allSettled([mongo.close(), pool.end()]);
    const failure = closed.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "sync_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
