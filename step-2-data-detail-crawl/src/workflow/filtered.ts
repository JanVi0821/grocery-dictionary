import type { PlaywrightCrawler, PlaywrightCrawlingContext } from "crawlee";
import { filteredProductsPage } from "../catalog.ts";
import { database, products, upsertProduct } from "../db.ts";
import { FILTER } from "../filter-crawl-config.ts";
import {
  completeFilterTask,
  nextFilterTask,
  prepareFilterCollection,
  type FilterTaskDocument,
} from "../filter-crawl-collection.ts";
import {
  createFilteredTask,
  FILTERED_TASK,
  type TaskRouter,
} from "../crawlers/tasks.ts";
import { rateSleep, runMatch } from "../crawlers/task-runtime.ts";

let lastTaskError: unknown = null;

export function registerFilteredTasks(router: TaskRouter) {
  router.addHandler(FILTERED_TASK, handleFilteredTask);
}

/** ponytail: 同一 filter 只运行一个实例；并行消费需求出现后再增加任务租约。 */
export async function runFilteredCrawl(
  crawler: PlaywrightCrawler,
  limit: number,
  rate: number,
) {
  lastTaskError = null;
  await products();
  const collection = await prepareFilterCollection(
    database(),
    FILTER,
    filteredProductsPage,
  );
  const first = await nextFilterTask(collection);
  console.log(
    JSON.stringify({
      event: "filtered_crawl_started",
      collection: collection.collectionName,
      filter: FILTER,
      limit,
      rate,
    }),
  );
  if (first)
    await crawler.run([
      createFilteredTask(collection.collectionName, first._id, limit, limit),
    ]);
  if (lastTaskError) throw lastTaskError;
  console.log(
    JSON.stringify({
      event: "filtered_crawl_finished",
      collection: collection.collectionName,
      completed: await collection.countDocuments({
        kind: "product",
        status: "completed",
      }),
      remaining: await collection.countDocuments({
        kind: "product",
        status: { $in: ["pending", "failed"] },
      }),
    }),
  );
}

async function handleFilteredTask(ctx: PlaywrightCrawlingContext) {
  const started = Date.now();
  const { collectionName, productId, remaining, limit } = ctx.request
    .userData as {
    collectionName: string;
    productId: number;
    remaining: number;
    limit: number;
  };
  const collection = database().collection<FilterTaskDocument>(collectionName);
  const enqueueNext = async () => {
    if (remaining <= 1) return;
    const next = await nextFilterTask(collection);
    if (next)
      await ctx.crawler.addRequests([
        createFilteredTask(collectionName, next._id, remaining - 1, limit),
      ]);
  };
  try {
    const task = await collection.findOne({ _id: productId, kind: "product" });
    if (!task || task.kind !== "product")
      throw new Error(`Filter task missing: ${productId}`);
    // 已写入完成标记但后续入队失败时，Crawlee 重试只负责接续队列。
    if (task.status === "completed") {
      await enqueueNext();
      await rateSleep(started);
    } else {
      await runMatch(
        ctx,
        task.product,
        limit - remaining + 1,
        limit,
        started,
        enqueueNext,
        async (result) => {
          const { productId, source, ...fields } = result;
          await completeFilterTask(
            collection,
            productId,
            result.needsReview,
            () => upsertProduct(productId, fields, source),
          );
        },
      );
    }
    lastTaskError = null;
  } catch (error) {
    lastTaskError = error;
    await collection.updateOne(
      { _id: productId, kind: "product", status: { $ne: "completed" } },
      {
        $set: {
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
        },
      },
    );
    throw error;
  }
}
