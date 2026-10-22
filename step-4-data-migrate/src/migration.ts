import type { Document } from "mongodb";
import type { Pool } from "pg";
import { EXCLUDED_FIELDS } from "./config.ts";

export interface SourceCompletion extends Document {
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

/** 只更新已有 products 的完整 detail；缺失映射时回滚整批，不创建不完整商品。 */
export async function writeProductsBatch(
  pool: Pick<Pool, "connect">,
  batch: SyncRow[],
): Promise<number> {
  if (!batch.length) return 0;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string | number }>(
      `update public.products as product
         set detail = incoming.detail
        from jsonb_to_recordset($1::jsonb) as incoming(id bigint, detail jsonb)
       where product.id = incoming.id
       returning product.id`,
      [JSON.stringify(batch)],
    );
    if (rows.length !== batch.length) {
      const updated = new Set(rows.map(({ id }) => Number(id)));
      throw new Error(
        `No products.id match for productId(s): ${batch
          .map((row) => row.id)
          .filter((id) => !updated.has(id))
          .join(", ")}`,
      );
    }
    await client.query("commit");
    return rows.length;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** 冲突时完整替换 name/detail，不忽略已有翻译、不合并旧 JSON。 */
export async function writeTranslationsBatch(
  pool: Pick<Pool, "connect">,
  rows: TranslationRow[],
): Promise<number> {
  if (!rows.length) return 0;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `insert into public.product_translations (product_id, lang, name, detail)
       select product_id, lang, name, detail
         from jsonb_to_recordset($1::jsonb) as incoming(product_id bigint, lang text, name text, detail jsonb)
       on conflict (product_id, lang) do update
         set name = excluded.name, detail = excluded.detail
       returning product_id as id`,
      [JSON.stringify(rows)],
    );
    if (result.rowCount !== rows.length)
      throw new Error(
        `Expected ${rows.length} translated rows, wrote ${result.rowCount}`,
      );
    await client.query("commit");
    return result.rowCount;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
