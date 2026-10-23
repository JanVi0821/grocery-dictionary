/** Shared payload contract: preserves the existing step-4 JSON mapping. */
export const EXCLUDED_FIELDS = new Set([
  "_id",
  "sku",
  "query",
  "score",
  "nwScore",
  "wwScore",
  "pnsScore",
  "attempts",
  "productId",
  "id",
  "product_name",
  "brand",
  "at",
  "needsReview",
  "retryAllVersion",
  "retryInvalidDetailVersion",
]);

export interface SourceCompletion extends Record<string, unknown> {
  productId: number;
  product_name?: unknown;
  source?: unknown;
  detail?: unknown;
}
export interface SyncRow {
  id: number;
  detail: Record<string, unknown>;
}
export interface TranslationRow {
  product_id: number;
  lang: string;
  name: string;
  detail: Record<string, unknown>;
}

/** 每次从当前原文构造完整 JSON，不与目标历史 detail 合并。 */
export function cleanDocument(
  document: SourceCompletion,
  translated = false,
): Record<string, unknown> {
  if (!Number.isSafeInteger(document.productId) || document.productId <= 0)
    throw new Error(
      `Invalid productId in source document ${String(document._id)}`,
    );
  const result = Object.fromEntries(
    Object.entries(document).filter(
      ([key]) =>
        !EXCLUDED_FIELDS.has(key) && (!translated || key !== "translation"),
    ),
  );
  if (
    typeof result.source !== "string" ||
    !result.source.trim() ||
    !result.detail ||
    typeof result.detail !== "object" ||
    Array.isArray(result.detail)
  )
    throw new Error(
      `Product ${document.productId} has an invalid source or detail object`,
    );
  if (
    translated &&
    (typeof document.product_name !== "string" || !document.product_name.trim())
  )
    throw new Error(
      `Product ${document.productId} has an invalid translated name`,
    );
  return result;
}
