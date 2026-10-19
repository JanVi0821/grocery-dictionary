/** 按配置 filter 读取当前匹配记录；重复执行覆盖已有结果，不以最大 ID 跳过历史记录。 */
import { MongoClient } from "mongodb";
import { Pool } from "pg";
import {
  BATCH_SIZE,
  SOURCE_DATABASE,
  ACTIVE_TRANSLATION_COLLECTION,
  TRANSLATION_FILTER,
  ACTIVE_TRANSLATION_LANG,
} from "./config.js";
import { readLimit } from "./cli.js";
import {
  cleanDocument,
  writeTranslationsBatch,
  type SourceCompletion,
  type TranslationRow,
} from "./migration.js";

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
      .collection<SourceCompletion>(ACTIVE_TRANSLATION_COLLECTION)
      .find(TRANSLATION_FILTER)
      .sort({ productId: 1, _id: 1 })
      .batchSize(BATCH_SIZE);
    if (limit !== Infinity) cursor.limit(limit);
    let written = 0;
    let previousProductId: number | undefined;
    const batch: TranslationRow[] = [];
    async function flush() {
      if (!batch.length) return;
      written += await writeTranslationsBatch(pool, batch);
      console.log(
        JSON.stringify({
          event: "translation_batch_written",
          written,
          batchSize: batch.length,
        }),
      );
      batch.length = 0;
    }
    try {
      for await (const document of cursor) {
        const detail = cleanDocument(document, true);
        if (document.productId === previousProductId)
          throw new Error(`Duplicate productId: ${document.productId}`);
        previousProductId = document.productId;
        batch.push({
          product_id: document.productId,
          lang: ACTIVE_TRANSLATION_LANG,
          name: document.product_name as string,
          detail,
        });
        if (batch.length === BATCH_SIZE) await flush();
      }
      await flush();
    } finally {
      await cursor.close();
    }
    console.log(
      JSON.stringify({
        event: "translation_sync_complete",
        collection: ACTIVE_TRANSLATION_COLLECTION,
        filter: TRANSLATION_FILTER,
        written,
        lang: ACTIVE_TRANSLATION_LANG,
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
      event: "translation_sync_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
