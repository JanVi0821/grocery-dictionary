import { setTimeout as sleep } from "node:timers/promises";
import type { PlaywrightCrawlingContext } from "crawlee";
import { searchFoodstuffs } from "./foodstuffs/search.ts";
import { matchProduct } from "./match-product.ts";
import { newWorldPlatform } from "./new-world/config.ts";
import { paknsavePlatform } from "./paknsave/config.ts";
import { searchWoolworth } from "./woolworth/handler.ts";
import { HeadersExpiredError } from "./errors.ts";
export let crawlStopReason: string | null = null;
let taskIntervalMs = 0;
export function setTaskIntervalMs(ms: number) {
  taskIntervalMs = ms;
}
export async function rateSleep(started: number) {
  const wait = taskIntervalMs - (Date.now() - started);
  if (wait > 0) await sleep(wait);
}

export type MatchResult = Awaited<ReturnType<typeof matchProduct>>;
export type SaveMatchResult = (result: MatchResult) => Promise<void>;
export async function runMatch(
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
      nwStores: newWorldPlatform.stores,
      pnsStores: paknsavePlatform.stores,
    });
    await saveResult(result);
    console.log(
      `[result] productId=${result.productId} valid=${!result.needsReview} sku=${result.sku} store=${result.storeName ?? "-"} source=${result.source}`,
    );
    await enqueueNext(product.id);
    await rateSleep(started);
  } catch (err) {
    await rateSleep(started);
    if (err instanceof HeadersExpiredError) {
      crawlStopReason = err.message;
      ctx.request.noRetry = true;
      ctx.crawler.stop(err.message);
    }
    throw err;
  }
}
