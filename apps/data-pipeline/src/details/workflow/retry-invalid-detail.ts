import type { PlaywrightCrawler, PlaywrightCrawlingContext } from "crawlee";
import { invalidDetailProductIds } from "../db.ts";
import {
  RETRY_INVALID_DETAIL_MARKER,
  RETRY_INVALID_DETAIL_VERSION,
} from "../retry-config.ts";
import {
  createInvalidDetailRetryTask,
  RETRY_INVALID_DETAIL_TASK,
  type TaskRouter,
} from "../crawlers/tasks.ts";
import { processRetryProduct } from "../crawlers/retry-product.ts";
/** 只重试非空且非对象的非法 detail，独立使用 retryInvalidDetailVersion。limit=0 表示全部。 */
export function registerInvalidDetailRetryTasks(router: TaskRouter) {
  router.addHandler(RETRY_INVALID_DETAIL_TASK, handleRetryInvalidDetailTask);
}
export async function runInvalidDetailRetry(
  crawler: PlaywrightCrawler,
  limit: number,
  rate: number,
) {
  const retryIds = await invalidDetailProductIds(limit);
  console.log(
    `[start] runMode=retry-invalid-detail version=${RETRY_INVALID_DETAIL_VERSION} limit=${limit} count=${retryIds.length} rate=${rate} products/s`,
  );
  if (!retryIds.length) return;
  await crawler.run([
    createInvalidDetailRetryTask(retryIds, retryIds.length, retryIds.length),
  ]);
}
async function handleRetryInvalidDetailTask(ctx: PlaywrightCrawlingContext) {
  const started = Date.now();
  const remaining = Number(ctx.request.userData.remaining);
  const limit = Number(ctx.request.userData.limit);
  const retryIds = ctx.request.userData.retryIds as number[];
  const productId = retryIds[limit - remaining];
  const marker = RETRY_INVALID_DETAIL_MARKER;
  const n = limit - remaining + 1;
  const enqueueNext = async () => {
    if (remaining <= 1) return;
    await ctx.crawler.addRequests([
      createInvalidDetailRetryTask(retryIds, remaining - 1, limit),
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
