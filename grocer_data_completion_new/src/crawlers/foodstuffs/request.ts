import { setTimeout as sleep } from "node:timers/promises";
import type { PlaywrightCrawlingContext } from "crawlee";
import { wrapRetailerError } from "../errors.ts";
import { captureFoodstuffsHeaders } from "./headers.ts";
import type { FoodstuffsPlatform } from "./types.ts";

export const DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS = 150;

function expired(statusCode?: number) {
  return statusCode === 401 || statusCode === 403;
}

let delayMs = DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS;
let lastAt = 0;

export function setFoodstuffsRequestDelay(ms: number) {
  delayMs = ms;
}

async function throttle() {
  if (delayMs <= 0) return;
  const wait = lastAt + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
}

export async function foodstuffsRequest(
  ctx: PlaywrightCrawlingContext,
  platform: FoodstuffsPlatform,
  opts: {
    url: string;
    method?: string;
    body?: string;
    barcode: string;
    storeId: string;
    storeName: string;
    stage: "search" | "detail";
  },
) {
  const fields = {
    source: platform.source,
    barcode: opts.barcode,
    storeId: opts.storeId,
    storeName: opts.storeName,
    stage: opts.stage,
  };

  if (!ctx.session?.userData[platform.headerKey]) {
    try {
      await captureFoodstuffsHeaders(ctx, platform);
    } catch (err) {
      throw wrapRetailerError(err, fields);
    }
  }

  const once = () =>
    ctx.sendRequest({
      url: opts.url,
      method: opts.method,
      body: opts.body,
      headers: {
        ...ctx.session!.userData[platform.headerKey],
        ...(opts.body ? { "content-type": "application/json" } : {}),
      },
      responseType: "json",
    });

  await throttle();

  let res;
  try {
    res = await once();
  } catch (err) {
    throw wrapRetailerError(err, fields);
  }
  if (expired(res.statusCode)) {
    try {
      await captureFoodstuffsHeaders(ctx, platform);
    } catch (err) {
      throw wrapRetailerError(err, fields);
    }
    await throttle();
    try {
      res = await once();
    } catch (err) {
      throw wrapRetailerError(err, fields);
    }
  }
  if (expired(res.statusCode)) {
    throw wrapRetailerError(
      new Error(`${platform.source} headers still expired after refresh`),
      fields,
    );
  }
  return res.body;
}
