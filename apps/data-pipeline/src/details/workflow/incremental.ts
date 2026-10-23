import type { PlaywrightCrawler, PlaywrightCrawlingContext } from "crawlee";
import { nextProduct } from "../catalog.ts";
import { latestProductId, upsertProduct } from "../db.ts";
import {
  createTask,
  INCREMENTAL_TASK,
  type TaskRouter,
} from "../crawlers/tasks.ts";
import {
  rateSleep,
  runMatch,
  type MatchResult,
} from "../crawlers/task-runtime.ts";
/** 普通抓取：仅按 MongoDB 最大 productId 之后的原商品续跑，不查询重试集合或写重试标记。 */
export function registerIncrementalTasks(router: TaskRouter) {
  router.addHandler(INCREMENTAL_TASK, handleIncrementalTask);
}
export async function runIncrementalCrawl(
  crawler: PlaywrightCrawler,
  limit: number,
  rate: number,
) {
  const afterId = await latestProductId();
  console.log(
    `[start] runMode=incremental latestProductId=${afterId} limit=${limit} rate=${rate} products/s`,
  );
  await crawler.run([createTask(afterId, limit, limit)]);
}
async function handleIncrementalTask(ctx: PlaywrightCrawlingContext) {
  const started = Date.now();
  const remaining = Number(ctx.request.userData.remaining);
  const limit = Number(ctx.request.userData.limit);
  const afterId = Number(ctx.request.userData.afterId);
  const n = limit - remaining + 1;
  const enqueueNext = async (productId: number) => {
    if (remaining <= 1) return;
    await ctx.crawler.addRequests([
      createTask(productId, remaining - 1, limit),
    ]);
  };

  const product = await nextProduct(afterId);
  if (!product) {
    console.log(`[task] no more products after ${afterId}`);
    await rateSleep(started);
    return;
  }
  try {
    await runMatch(
      ctx,
      product,
      n,
      limit,
      started,
      enqueueNext,
      saveNormalResult,
    );
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function saveNormalResult(result: MatchResult) {
  const { productId, source, ...fields } = result;
  await upsertProduct(productId, fields, source);
}
