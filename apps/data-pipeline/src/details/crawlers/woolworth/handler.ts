import type { PlaywrightCrawlingContext } from "crawlee";
import { RetailerRequestError } from "../errors.ts";
import type { WwSearchResult } from "../match-product.ts";
import { WW_ORIGIN, wwGet, wwSearchUrl } from "./headers.ts";
import { findWoolworthByBarcode, itemSku, type SearchItem } from "./match.ts";

type SearchBody = { products?: { items?: SearchItem[] } };

export async function searchWoolworth(
  ctx: PlaywrightCrawlingContext,
  barcode: string,
): Promise<WwSearchResult> {
  let body: SearchBody;
  try {
    console.log(`[search-Woolworth] barcode=${barcode}`);
    body = (await wwGet(ctx, wwSearchUrl(barcode))) as SearchBody;
  } catch (err) {
    if (err instanceof RetailerRequestError) {
      return {
        resultCount: 0,
        hit: null,
        status: "request-error",
        stage: "search",
        errorMessage: err.message,
      };
    }
    throw err;
  }
  const items = body.products?.items ?? [];
  const item = findWoolworthByBarcode(items, barcode);
  if (!item) {
    return {
      resultCount: items.length,
      hit: null,
      status: items.length ? "invalid-result" : "no-result",
      stage: "search",
      errorMessage: null,
    };
  }
  const sku = itemSku(item);
  if (!sku) {
    return {
      resultCount: items.length,
      hit: null,
      status: "invalid-result",
      stage: "search",
      errorMessage: null,
    };
  }
  try {
    return {
      resultCount: items.length,
      status: "matched",
      stage: "detail",
      errorMessage: null,
      hit: {
        sku,
        detail: await wwGet(ctx, `${WW_ORIGIN}/api/v1/products/${sku}`),
      },
    };
  } catch (err) {
    if (err instanceof RetailerRequestError) {
      return {
        resultCount: items.length,
        status: "detail-error",
        stage: "detail",
        errorMessage: err.message,
        hit: { sku, detail: null },
      };
    }
    throw err;
  }
}
