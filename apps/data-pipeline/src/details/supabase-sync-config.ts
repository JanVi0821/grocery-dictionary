import type { Document, Filter } from "mongodb";

/** MongoDB 筛选条件，与抓取用的 Supabase FILTER 无关。{} 读取全部记录，仍校验 detail。 */
export const SUPABASE_SYNC_FILTER: Filter<Document> = {
  needsReview: false,
  // productId: 111067,
  // at: { $gte: new Date("2026-10-22T00:00:00Z") },
};

/** MongoDB 游标每批读取数量；不是本次迁移总数，总数由 --limit 控制。 */
export const SUPABASE_SYNC_BATCH_SIZE = 100;
