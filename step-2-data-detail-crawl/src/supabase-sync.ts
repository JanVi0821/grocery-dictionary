import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Json,
} from "../../fe/src/types/generated/database.types.ts";
import {
  cleanDocument,
  type SourceCompletion,
} from "../../step-4-data-migrate/src/migration.ts";
import { removeUnusedDetailFields } from "./detail-fields.ts";

/**
 * productId 对应 products.id，完整替换 detail 列，不修改基础商品信息。
 * 复用 step-4 的外层清理规则和当前抓取的内层清理规则；不回写 MongoDB。
 * 重复调用覆盖同一条商品的 detail，不新增重复商品，也不合并已删除的 JSON 字段。
 * 补全记录缺少创建商品所需的 grocer_id/unit 等，目标不存在时必须报错。
 */
export async function syncProductDetail(
  supabase: SupabaseClient<Database>,
  document: SourceCompletion,
) {
  const payload = cleanDocument({
    ...document,
    detail: removeUnusedDetailFields(
      typeof document.source === "string" ? document.source : "",
      document.detail,
    ),
  });
  // 与现有迁移一致，以 JSON 序列化转换 BSON/Date，避免向 JSONB 发送非 JSON 值。
  const detail = JSON.parse(JSON.stringify(payload)) as Json;
  const { data, error } = await supabase
    .from("products")
    .update({ detail })
    .eq("id", document.productId)
    .select("id")
    .abortSignal(AbortSignal.timeout(60_000))
    .maybeSingle();
  if (error)
    throw new Error(`Product ${document.productId}: ${error.message}`, {
      cause: error,
    });
  if (!data)
    throw new Error(
      `No products.id match for productId: ${document.productId}`,
    );
  return data.id;
}
