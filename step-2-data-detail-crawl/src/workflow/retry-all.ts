import type { PlaywrightCrawler, PlaywrightCrawlingContext } from "crawlee";
import { retryProductIds } from "../db.ts";
import { RETRY_ALL_MARKER, RETRY_ALL_VERSION } from "../retry-config.ts";
import {
  createRetryTask,
  RETRY_ALL_TASK,
  type TaskRouter,
} from "../crawlers/tasks.ts";
import { processRetryProduct } from "../crawlers/retry-product.ts";
/** 只重试 needsReview=true 且尚无当前 retryAllVersion 的记录。 */
export function registerRetryAllTasks(router: TaskRouter) {
  router.addHandler(RETRY_ALL_TASK, handleRetryAllTask);
}
export async function runRetryAll(
  crawler: PlaywrightCrawler,
  limit: number,
  rate: number,
) {
  const retryIds = await retryProductIds(limit);
  console.log(
    `[start] runMode=retry-all version=${RETRY_ALL_VERSION} limit=${limit} count=${retryIds.length} rate=${rate} products/s`,
  );
  if (!retryIds.length) return;
  await crawler.run([
    createRetryTask(retryIds, retryIds.length, retryIds.length),
  ]);
}
async function handleRetryAllTask(ctx: PlaywrightCrawlingContext) {
  const started = Date.now();
  const remaining = Number(ctx.request.userData.remaining);
  const limit = Number(ctx.request.userData.limit);
  const retryIds = ctx.request.userData.retryIds as number[];
  const productId = retryIds[limit - remaining];
  const marker = RETRY_ALL_MARKER;
  const n = limit - remaining + 1;
  const enqueueNext = async () => {
    if (remaining <= 1) return;
    await ctx.crawler.addRequests([
      createRetryTask(retryIds, remaining - 1, limit),
    ]);
  };

  await processRetryProduct(
    ctx,
    productId,
    n,
    limit,
    started,
    marker,
    enqueueNext,
  );
}
