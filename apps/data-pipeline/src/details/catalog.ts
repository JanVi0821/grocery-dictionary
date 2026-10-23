import { createClient } from "@supabase/supabase-js";
import { loadRuntimeEnvironment } from "../paths.ts";
import type { Database } from "@grocery/product-model/database";
import type { SupabaseCrawlFilter } from "./filter-crawl-config.ts";

loadRuntimeEnvironment("details");

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY missing");

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 仅为 detail IS NULL 且条码数组非空的商品建任务，自定义 filter 作为额外 AND 条件。 */
export async function filteredProductsPage(
  afterId: number,
  filter: SupabaseCrawlFilter,
) {
  let query = supabase
    .from("products")
    .select("id, name, brand, barcodes")
    .is("detail", null)
    // PostgreSQL 数组字面量 {} 表示空数组；NULL 也不会通过此比较。
    .not("barcodes", "eq", "{}");
  for (const [column, operators] of Object.entries(filter)) {
    for (const [operator, value] of Object.entries(operators!)) {
      query = query.filter(column, operator, value);
    }
  }
  const { data, error } = await query
    .gt("id", afterId)
    .order("id", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data;
}

export type Product = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name" | "brand" | "barcodes"
>;

export async function nextProduct(afterId: number) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand, barcodes")
    .gt("id", afterId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function productById(productId: number) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand, barcodes")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadRetryProduct(
  productId: number,
  getById: (id: number) => Promise<Product | null> = productById,
) {
  const product = await getById(productId);
  if (!product) return { skip: true as const, product: null };
  return { skip: false as const, product };
}
