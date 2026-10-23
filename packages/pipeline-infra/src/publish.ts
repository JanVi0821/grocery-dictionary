import type { Pool } from "pg";
import type {
  SyncRow,
  TranslationRow,
} from "@grocery/product-model/completion";

/** 缺失原商品属于映射异常，不能创建残缺商品或继续忽略该问题。 */
export class MissingProductMappingError extends Error {}

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
      throw new MissingProductMappingError(
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
