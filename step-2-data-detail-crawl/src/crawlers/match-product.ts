import { token_set_ratio } from "fuzzball";
import { uniqueBarcodes } from "../barcodes.ts";
import { PlatformUnavailableError } from "./errors.ts";
import type { FoodstuffsStore } from "./foodstuffs/types.ts";
import type { Attempt, AttemptStatus } from "./foodstuffs/types.ts";

export type { Attempt, AttemptStatus };
export { PlatformUnavailableError, RetailerRequestError } from "./errors.ts";

export type ProductInput = {
  id: number;
  name: string;
  brand: string | null;
  barcodes: string[];
};

export type MatchSource = "woolworths" | "new-world" | "paknsave" | "-";

export type MatchResult = {
  productId: number;
  query: string | null;
  product_name: string;
  brand: string | null;
  source: MatchSource;
  sku: string | null;
  storeId: string | null;
  storeName: string | null;
  detail: unknown;
  needsReview: boolean;
  wwScore: number;
  nwScore: number;
  pnsScore: number;
  attempts: Attempt[];
};

export type WwHit = { sku: string; detail: unknown };
export type WwSearchResult = {
  resultCount: number;
  hit: WwHit | null;
  status: AttemptStatus;
  stage?: "search" | "detail" | null;
  errorMessage?: string | null;
};

export type FsHit = {
  sku: string;
  name?: string;
  detail: unknown;
  storeId: string;
  storeName: string;
};
export type FsSearchResult = {
  resultCount: number;
  hit: FsHit | null;
  status: AttemptStatus;
  stage?: "search" | "detail" | null;
  errorMessage?: string | null;
};

export function nwNameScore(sourceName: string, candidateName: string) {
  return token_set_ratio(sourceName.toLowerCase(), candidateName.toLowerCase());
}

export const pnsNameScore = nwNameScore;

export function platformDown(attempts: Attempt[]) {
  return (
    attempts.length > 0 &&
    attempts.every(
      (a) => a.status === "request-error" || a.status === "detail-error",
    )
  );
}

function logAttemptError(productId: number, attempt: Attempt) {
  if (attempt.status !== "request-error" && attempt.status !== "detail-error") {
    return;
  }
  console.error(
    `[${attempt.status}] productId=${productId} source=${attempt.source} storeId=${attempt.storeId} storeName=${attempt.storeName} barcode=${attempt.barcode} ${attempt.errorMessage ?? ""}`,
  );
}

function throwIfPlatformDown(
  productId: number,
  source: Attempt["source"],
  mine: Attempt[],
) {
  if (!platformDown(mine)) return;
  const last = mine.at(-1)!;
  throw new PlatformUnavailableError(productId, source, {
    storeId: last.storeId,
    storeName: last.storeName,
    barcode: last.barcode,
    message: last.errorMessage ?? last.status,
  });
}

export async function matchProduct(
  product: ProductInput,
  deps: {
    searchWw: (barcode: string) => Promise<WwSearchResult | WwHit | null>;
    searchNw: (
      store: FoodstuffsStore,
      barcode: string,
    ) => Promise<FsSearchResult | FsHit | null>;
    searchPns: (
      store: FoodstuffsStore,
      barcode: string,
    ) => Promise<FsSearchResult | FsHit | null>;
    nwStores: readonly FoodstuffsStore[];
    pnsStores: readonly FoodstuffsStore[];
  },
): Promise<MatchResult> {
  const codes = uniqueBarcodes(product.barcodes);
  const attempts: Attempt[] = [];
  const base = {
    productId: product.id,
    product_name: product.name,
    brand: product.brand,
  };

  const fail = (): MatchResult => ({
    ...base,
    query: null,
    source: "-",
    sku: null,
    storeId: null,
    storeName: null,
    wwScore: 0,
    nwScore: 0,
    pnsScore: 0,
    detail: null,
    needsReview: true,
    attempts,
  });

  if (!codes.length) return fail();

  const wwFrom = attempts.length;
  for (const code of codes) {
    const result = normalizeWw(await deps.searchWw(code));
    const attempt: Attempt = {
      barcode: code,
      source: "woolworths",
      storeId: null,
      storeName: null,
      stage: result.stage ?? "search",
      status: result.status,
      resultCount: result.resultCount,
      sku: result.hit?.sku ?? null,
      candidateName: null,
      score: result.status === "matched" ? 1000 : null,
      errorMessage: result.errorMessage ?? null,
    };
    attempts.push(attempt);
    logAttemptError(product.id, attempt);
    if (result.status === "matched" && result.hit) {
      return {
        ...base,
        query: code,
        source: "woolworths",
        sku: result.hit.sku,
        storeId: null,
        storeName: null,
        wwScore: 1000,
        nwScore: 0,
        pnsScore: 0,
        detail: result.hit.detail,
        needsReview: false,
        attempts,
      };
    }
  }
  throwIfPlatformDown(product.id, "woolworths", attempts.slice(wwFrom));

  const fsHit = await searchPlatform({
    productId: product.id,
    codes,
    stores: deps.nwStores,
    source: "new-world",
    search: deps.searchNw,
    productName: product.name,
    attempts,
  });
  if (fsHit) {
    return {
      ...base,
      query: fsHit.barcode,
      source: "new-world",
      sku: fsHit.hit.sku,
      storeId: fsHit.hit.storeId,
      storeName: fsHit.hit.storeName,
      wwScore: 0,
      nwScore: fsHit.score,
      pnsScore: 0,
      detail: fsHit.hit.detail,
      needsReview: false,
      attempts,
    };
  }

  const pnsHit = await searchPlatform({
    productId: product.id,
    codes,
    stores: deps.pnsStores,
    source: "paknsave",
    search: deps.searchPns,
    productName: product.name,
    attempts,
  });
  if (pnsHit) {
    return {
      ...base,
      query: pnsHit.barcode,
      source: "paknsave",
      sku: pnsHit.hit.sku,
      storeId: pnsHit.hit.storeId,
      storeName: pnsHit.hit.storeName,
      wwScore: 0,
      nwScore: 0,
      pnsScore: pnsHit.score,
      detail: pnsHit.hit.detail,
      needsReview: false,
      attempts,
    };
  }

  return fail();
}

async function searchPlatform(opts: {
  productId: number;
  codes: string[];
  stores: readonly FoodstuffsStore[];
  source: "new-world" | "paknsave";
  search: (
    store: FoodstuffsStore,
    barcode: string,
  ) => Promise<FsSearchResult | FsHit | null>;
  productName: string;
  attempts: Attempt[];
}) {
  const from = opts.attempts.length;
  for (const code of opts.codes) {
    for (const store of opts.stores) {
      const result = normalizeFs(await opts.search(store, code), store);
      const scored =
        result.status === "matched" || result.status === "detail-error";
      const score = scored
        ? nwNameScore(opts.productName, result.hit?.name ?? "")
        : null;
      const attempt: Attempt = {
        barcode: code,
        source: opts.source,
        storeId: store.id,
        storeName: store.name,
        stage: result.stage ?? (result.status === "detail-error" ? "detail" : "search"),
        status: result.status,
        resultCount: result.resultCount,
        sku: result.hit?.sku ?? null,
        candidateName: result.hit?.name ?? null,
        score,
        errorMessage: result.errorMessage ?? null,
      };
      opts.attempts.push(attempt);
      logAttemptError(opts.productId, attempt);
      if (result.status === "matched" && result.hit) {
        return { barcode: code, hit: result.hit, score: score ?? 0 };
      }
    }
  }
  throwIfPlatformDown(opts.productId, opts.source, opts.attempts.slice(from));
  return null;
}

function normalizeWw(raw: WwSearchResult | WwHit | null): WwSearchResult {
  if (!raw) return { status: "no-result", resultCount: 0, hit: null, stage: "search", errorMessage: null };
  if ("status" in raw) return raw;
  return { status: "matched", resultCount: 1, hit: raw, stage: "detail", errorMessage: null };
}

function normalizeFs(
  raw: FsSearchResult | FsHit | null,
  store: FoodstuffsStore,
): FsSearchResult {
  if (!raw) {
    return {
      status: "no-result",
      resultCount: 0,
      hit: null,
      stage: "search",
      errorMessage: null,
    };
  }
  if ("status" in raw) return raw;
  return {
    status: "matched",
    resultCount: 1,
    stage: "detail",
    errorMessage: null,
    hit: {
      ...raw,
      storeId: raw.storeId ?? store.id,
      storeName: raw.storeName ?? store.name,
    },
  };
}
