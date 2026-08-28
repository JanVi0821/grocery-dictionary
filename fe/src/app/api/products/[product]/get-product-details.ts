import "server-only";

import { supabase } from "@/lib/supabase/server";

export async function getProductDetails(productId: number, _locale: string) {
  void _locale;

  const { data: product, error } = await supabase
    .from("products")
    .select("id, barcodes, brand, grocer_id, name, size, unit")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load product details.", { cause: error });
  }

  return product;
}
