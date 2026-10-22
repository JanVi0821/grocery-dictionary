/**
 * 按配置筛选原始 data_completion，逐条迁移至 Supabase products.detail。
 * 与浏览器抓取/任务 collection 无关；不保存断点，重复执行重新覆盖全部匹配记录。
 * --limit 限制本次读取数量；未知参数报错，无 dry-run。失败时停止，已写入的记录保留。
 */
import { readLimit } from "../../../step-4-data-migrate/src/cli.ts";
import type { SourceCompletion } from "../../../step-4-data-migrate/src/migration.ts";
import { supabase } from "../catalog.ts";
import { closeDb, products } from "../db.ts";
import { syncProductDetail } from "../supabase-sync.ts";
import {
  SUPABASE_SYNC_BATCH_SIZE,
  SUPABASE_SYNC_FILTER,
} from "../supabase-sync-config.ts";

async function main() {
  const limit = readLimit(process.argv.slice(2));
  try {
    const collection = await products();
    const cursor = collection
      .find<SourceCompletion>(SUPABASE_SYNC_FILTER)
      .sort({ productId: 1, _id: 1 })
      .batchSize(SUPABASE_SYNC_BATCH_SIZE);
    if (limit !== Infinity) cursor.limit(limit);
    let written = 0;
    console.log(
      JSON.stringify({
        event: "supabase_sync_started",
        collection: collection.namespace,
        filter: SUPABASE_SYNC_FILTER,
        limit: limit === Infinity ? null : limit,
      }),
    );
    try {
      for await (const document of cursor) {
        console.log(
          JSON.stringify({
            event: "supabase_sync_row_started",
            productId: document.productId,
            _id: document._id,
          }),
        );
        const productId = await syncProductDetail(supabase, document);
        written++;
        console.log(
          JSON.stringify({
            event: "supabase_sync_row_written",
            productId,
            written,
          }),
        );
      }
    } finally {
      await cursor.close();
    }
    console.log(JSON.stringify({ event: "supabase_sync_complete", written }));
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "supabase_sync_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
