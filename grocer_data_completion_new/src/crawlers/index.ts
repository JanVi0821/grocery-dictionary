import { setTimeout as sleep } from "node:timers/promises";
import type { PlaywrightCrawlingContext } from "crawlee";
import { loadRetryProduct, nextProduct } from "../catalog.ts";
import { hasRetryMarker, markRetryFinished, upsertProduct } from "../db.ts";
import {
  RETRY_ALL_MARKER,
  RETRY_INVALID_DETAIL_MARKER,
  type RetryMarker,
} from "../retry-config.ts";
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

export function createInvalidDetailRetryTask(
  retryIds: number[],
  remaining: number,
  limit: number,
) {
  const index = limit - remaining;
  return {
    url: "https://www.woolworths.co.nz/",
    label: TASK,
    skipNavigation: true as const,
    uniqueKey: `retry-invalid-detail:${retryIds[index]}:${remaining}`,
    userData: { retryInvalidDetail: true, retryIds, remaining, limit },
  };
}

async function rateSleep(started: number) {
  const wait = taskIntervalMs - (Date.now() - started);
  if (wait > 0) await sleep(wait);
}

async function handleTask(ctx: PlaywrightCrawlingContext) {
  if (ctx.request.userData.retry) {
    await handleRetryAllTask(ctx);
    return;
  }
  if (ctx.request.userData.retryInvalidDetail) {
    await handleRetryInvalidDetailTask(ctx);
    return;
  }
  await handleIncrementalTask(ctx);
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

  await processRetryProduct(ctx, productId, n, limit, started, marker, enqueueNext);
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

  await processRetryProduct(ctx, productId, n, limit, started, marker, enqueueNext);
}

async function processRetryProduct(
  ctx: PlaywrightCrawlingContext,
  productId: number,
  n: number,
  limit: number,
  started: number,
  marker: RetryMarker,
  enqueueNext: () => Promise<void>,
) {
  if (await hasRetryMarker(productId, marker)) {
    console.log(
      `[skip] productId=${productId} already has ${marker.field}=${marker.version}`,
    );
    await enqueueNext();
    await rateSleep(started);
    return;
  }

  try {
    const loaded = await loadRetryProduct(productId);
    if (loaded.skip) {
      console.log(`[skip] productId=${productId} missing in supabase`);
      await markRetryFinished(productId, marker);
      await enqueueNext();
      await rateSleep(started);
      return;
    }
    await runMatch(
      ctx,
      loaded.product,
      n,
      limit,
      started,
      enqueueNext,
      (result) => saveRetryResult(result, marker),
    );
  } catch (error) {
    await markRetryFinished(productId, marker);
    console.error(`[retry-failed] productId=${productId} ${marker.field}=${marker.version}`, error);
    throw error;
  }
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

type MatchResult = Awaited<ReturnType<typeof matchProduct>>;
type SaveMatchResult = (result: MatchResult) => Promise<void>;

async function saveNormalResult(result: MatchResult) {
  const { productId, source, ...fields } = result;
  await upsertProduct(productId, fields, source);
}

async function saveRetryResult(result: MatchResult, marker: RetryMarker) {
  const { productId, source, ...fields } = result;
  await upsertProduct(
    productId,
    { ...fields, [marker.field]: marker.version },
    source,
  );
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
  saveResult: SaveMatchResult,
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
    await saveResult(result);
    console.log(
      `[result] productId=${result.productId} valid=${!result.needsReview} sku=${result.sku} query=${result.query} store=${result.storeName ?? "-"} source=${result.source}`,
    );
    await enqueueNext(product.id);
    await rateSleep(started);
  } catch (err) {
    await rateSleep(started);
    throw err;
  }
}
