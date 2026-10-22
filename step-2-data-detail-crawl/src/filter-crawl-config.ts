import type { Database } from "../../fe/src/types/generated/database.types.ts";

/** 字段 -> PostgREST 操作符 -> 值；同一字段可同时设 gte/lt 等条件，全部以 AND 组合。 */
export type SupabaseCrawlFilter = Partial<
  Record<
    keyof Database["public"]["Tables"]["products"]["Row"],
    Record<string, string | number | boolean | null>
  >
>;

/** 额外筛选条件；{} 仍强制 detail IS NULL 且 barcodes 非空。日期字段为 update_at_from_grocer。 */
export const FILTER: SupabaseCrawlFilter = {
  update_at_from_grocer: {
    gte: "2026-10-20",
  },
};
/** 实际集合名 = 前缀 + SHA-256(规范化的 filter JSON)，相同 filter 复用原任务快照。 */
export const FILTER_TASK_COLLECTION_PREFIX = "data_completion_filter_";
