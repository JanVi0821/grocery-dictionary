import type { Filter, Document } from "@grocery/pipeline-infra/mongodb";

/** 普通迁移的 MongoDB 筛选条件；{} 不加任何条件，读取全部记录。 */
export const FILTER: Filter<Document> = {
  needsReview: false,
  at: {
    $gte: new Date("2026-10-20T00:00:00Z"),
  },
};
/** 翻译迁移的独立条件；{} 读取全部记录，不隐式追加完成状态。 */
export const TRANSLATION_FILTER: Filter<Document> = {
  needsReview: false,
  at: {
    $gte: new Date("2026-10-20T00:00:00Z"),
  },
};
export const BATCH_SIZE = 100;
export const SOURCE_DATABASE = "grocery_dictionary";
export const SOURCE_COLLECTION = "data_completion";

// Select the translation collection by changing ACTIVE_TRANSLATION_LANG.
export const TRANSLATION_COLLECTIONS = {
  zh: "data_completion_zh",
} as const;
export const ACTIVE_TRANSLATION_LANG = "zh";
export const ACTIVE_TRANSLATION_COLLECTION =
  TRANSLATION_COLLECTIONS[ACTIVE_TRANSLATION_LANG];

export { EXCLUDED_FIELDS } from "@grocery/product-model/completion";

/** 新发布任务的规则版本；需要新任务集时显式更改 batch，不重置旧任务。 */
export const DETAIL_PUBLISH_VERSION = 1;
export const TRANSLATION_PUBLISH_VERSION = 1;
