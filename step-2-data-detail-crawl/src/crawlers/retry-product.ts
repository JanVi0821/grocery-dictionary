import type { PlaywrightCrawlingContext } from "crawlee";
import { loadRetryProduct } from "../catalog.ts";
import { hasRetryMarker, markRetryFinished, upsertProduct } from "../db.ts";
import type { RetryMarker } from "../retry-config.ts";
import { HeadersExpiredError } from "./errors.ts";
import { rateSleep, runMatch, type MatchResult } from "./task-runtime.ts";
/** 两种重试共用逐商品执行机制，筛选条件、版本标记和任务链由各自流程明确指定。 */
export async function processRetryProduct(
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
    if (!(error instanceof HeadersExpiredError)) {
      await markRetryFinished(productId, marker);
    }
    console.error(
      `[retry-failed] productId=${productId} ${marker.field}=${marker.version}`,
      error,
    );
    throw error;
  }
}

async function saveRetryResult(result: MatchResult, marker: RetryMarker) {
  const { productId, source, ...fields } = result;
  await upsertProduct(
    productId,
    { ...fields, [marker.field]: marker.version },
    source,
  );
}
