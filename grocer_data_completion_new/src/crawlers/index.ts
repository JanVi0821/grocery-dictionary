import { setTimeout as sleep } from "node:timers/promises";
import type { PlaywrightCrawlingContext } from "crawlee";
import { loadRetryProduct, nextProduct } from "../catalog.ts";
import { upsertProduct } from "../db.ts";
import { searchFoodstuffs } from "./foodstuffs/search.ts";
import { storesForMode, type StoreMode } from "./foodstuffs/stores.ts";
import { matchProduct } from "./match-product.ts";
import { newWorldPlatform } from "./new-world/config.ts";
import { paknsavePlatform } from "./paknsave/config.ts";
import { searchWoolworth } from "./woolworth/handler.ts";

export const TASK = "task";

let taskIntervalMs = 0;
export function setTaskIntervalMs(ms: number) {
  taskIntervalMs = ms;
}

let storeMode: StoreMode = "fast";
export function setStoreMode(mode: StoreMode) {
  storeMode = mode;
}

export function registerTasks(router: {
  addHandler: (
    label: string,
    handler: (ctx: PlaywrightCrawlingContext) => Promise<void>,
  ) => unknown;
}) {
  router.addHandler(TASK, handleTask);
}

export function createTask(afterId: number, remaining: number, limit: number) {
  return {
    url: "https://www.woolworths.co.nz/",
    label: TASK,
    skipNavigation: true as const,
    uniqueKey: `task:${afterId}:${remaining}`,
    userData: { afterId, remaining, limit },
  };
}

export function createRetryTask(
  retryIds: number[],
  remaining: number,
  limit: number,
) {
  const index = limit - remaining;
  return {
    url: "https://www.woolworths.co.nz/",
    label: TASK,
    skipNavigation: true as const,
    uniqueKey: `retry:${retryIds[index]}:${remaining}`,
    userData: { retry: true, retryIds, remaining, limit },
  };
}

async function rateSleep(started: number) {
  const wait = taskIntervalMs - (Date.now() - started);
  if (wait > 0) await sleep(wait);
}

async function handleTask(ctx: PlaywrightCrawlingContext) {
  const started = Date.now();
  const remaining = Number(ctx.request.userData.remaining);
  const limit = Number(ctx.request.userData.limit);
  const retry = Boolean(ctx.request.userData.retry);
  const n = limit - remaining + 1;

  const enqueueNext = async (afterProductId: number) => {
    if (remaining <= 1) return;
    const req = retry
      ? createRetryTask(
          ctx.request.userData.retryIds as number[],
          remaining - 1,
          limit,
        )
      : createTask(afterProductId, remaining - 1, limit);
    await ctx.crawler.addRequests([req]);
  };

  if (retry) {
    const ids = ctx.request.userData.retryIds as number[];
    const productId = ids[limit - remaining];
    const loaded = await loadRetryProduct(productId);
    if (loaded.skip) {
      console.log(`[skip] productId=${productId} missing in supabase`);
      await enqueueNext(productId);
      await rateSleep(started);
      return;
    }
    await runMatch(ctx, loaded.product, n, limit, started, enqueueNext);
    return;
  }

  const afterId = Number(ctx.request.userData.afterId);
  const product = await nextProduct(afterId);
  if (!product) {
    console.log(`[task] no more products after ${afterId}`);
    await rateSleep(started);
    return;
  }
  await runMatch(ctx, product, n, limit, started, enqueueNext);
}

async function runMatch(
  ctx: PlaywrightCrawlingContext,
  product: {
    id: number;
    name: string;
    brand: string | null;
    barcodes: string[];
  },
  n: number,
  limit: number,
  started: number,
  enqueueNext: (productId: number) => Promise<void>,
) {
  console.log(`[${n}/${limit}] running productId=${product.id}`);
  try {
    const result = await matchProduct(product, {
      searchWw: (barcode) => searchWoolworth(ctx, barcode),
      searchNw: (store, barcode) =>
        searchFoodstuffs(ctx, newWorldPlatform, store, barcode),
      searchPns: (store, barcode) =>
        searchFoodstuffs(ctx, paknsavePlatform, store, barcode),
      nwStores: storesForMode(newWorldPlatform, storeMode),
      pnsStores: storesForMode(paknsavePlatform, storeMode),
    });
    const { productId, source, ...fields } = result;
    await upsertProduct(productId, fields, source);
    console.log(
      `[result] productId=${productId} valid=${!result.needsReview} sku=${result.sku} query=${result.query} store=${result.storeName ?? "-"} source=${source}`,
    );
    await enqueueNext(product.id);
    await rateSleep(started);
  } catch (err) {
    console.error(err);
    await rateSleep(started);
    throw err;
  }
}
