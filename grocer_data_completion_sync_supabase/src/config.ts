// MongoDB field spelling verified against the source collection.
export const FILTER = { needsReview: false } as const;
export const BATCH_SIZE = 100;
export const SOURCE_DATABASE = "grocery_dictionary";

// Select the translation collection by changing ACTIVE_TRANSLATION_LANG.
export const TRANSLATION_COLLECTIONS = {
  zh: "data_completion_zh",
} as const;
export const ACTIVE_TRANSLATION_LANG = "zh";
export const ACTIVE_TRANSLATION_COLLECTION =
  TRANSLATION_COLLECTIONS[ACTIVE_TRANSLATION_LANG];

export const EXCLUDED_FIELDS = new Set([
  "_id",
  "sku",
  "query",
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
