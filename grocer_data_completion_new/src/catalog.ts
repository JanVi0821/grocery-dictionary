import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../fe/src/types/generated/database.types.ts";

process.loadEnvFile();

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY missing");

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
