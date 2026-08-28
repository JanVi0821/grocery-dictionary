import type { PlaywrightCrawlingContext } from "crawlee";
import { RetailerRequestError } from "../errors.ts";
import { foodstuffsSearchPayload } from "./payload.ts";
import { foodstuffsRequest } from "./request.ts";
import type {
  AttemptStatus,
  FoodstuffsPlatform,
  FoodstuffsStore,
} from "./types.ts";

export type FsItem = { productId?: string; name?: string };
type SearchBody = { products?: FsItem[] };

export function firstFoodstuffsProduct(items: FsItem[]) {
  return items[0];
}

export function foodstuffsDetailUrl(api: string, storeId: string, sku: string) {
  return `${api}/v1/edge/store/${storeId}/product/${sku}`;
}

export type FsSearchResult = {
  resultCount: number;
  hit: {
    sku: string;
    name?: string;
    detail: unknown;
    storeId: string;
    storeName: string;
  } | null;
  status: AttemptStatus;
  stage: "search" | "detail" | null;
  errorMessage: string | null;
};

export async function searchFoodstuffs(
  ctx: PlaywrightCrawlingContext,
  platform: FoodstuffsPlatform,
  store: FoodstuffsStore,
  barcode: string,
): Promise<FsSearchResult> {
  const meta = {
    barcode,
    storeId: store.id,
    storeName: store.name,
  };
  console.log(`[search-${platform.source}] barcode=${barcode}`);
  let body: SearchBody;
  try {
    body = (await foodstuffsRequest(ctx, platform, {
      url: `${platform.api}/v1/edge/search/paginated/products`,
      method: "POST",
      body: JSON.stringify(foodstuffsSearchPayload(barcode, store)),
      stage: "search",
      ...meta,
    })) as SearchBody;
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

  const products = body.products ?? [];
  const item = firstFoodstuffsProduct(products);
  if (!item) {
    return {
      resultCount: 0,
      hit: null,
      status: "no-result",
      stage: "search",
      errorMessage: null,
    };
  }
  const sku = item.productId ?? "";
  if (!sku) {
    return {
      resultCount: products.length,
      hit: null,
      status: "invalid-result",
      stage: "search",
      errorMessage: null,
    };
  }

  try {
    const detail = await foodstuffsRequest(ctx, platform, {
      url: foodstuffsDetailUrl(platform.api, store.id, sku),
      stage: "detail",
      ...meta,
    });
    return {
      resultCount: products.length,
      status: "matched",
      stage: "detail",
      errorMessage: null,
      hit: {
        sku,
        name: item.name,
        detail,
        storeId: store.id,
        storeName: store.name,
      },
    };
  } catch (err) {
    if (err instanceof RetailerRequestError) {
      return {
        resultCount: products.length,
        status: "detail-error",
        stage: "detail",
        errorMessage: err.message,
        hit: {
          sku,
          name: item.name,
          detail: null,
          storeId: store.id,
          storeName: store.name,
        },
      };
    }
    throw err;
  }
}
