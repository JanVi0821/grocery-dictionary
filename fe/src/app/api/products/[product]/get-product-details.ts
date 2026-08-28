import "server-only";

import { supabase } from "@/lib/supabase/server";
import type { Tables } from "@/types/generated/database.types";

type Product = Tables<"products">;
type ProductTranslation = Tables<"product_translations">;

export async function getProductDetails(productId: number, locale: string) {
  const [{ data: product, error }, { data: translation, error: translationError }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", productId).maybeSingle(),
      supabase
        .from("product_translations")
        .select("*")
        .eq("product_id", productId)
        .eq("language_code", locale)
        .maybeSingle(),
    ]);

  if (error || translationError) {
    throw new Error("Failed to load product details.", {
      cause: error ?? translationError,
    });
  }

  if (!product) {
    return null;
  }

  return {
    ...product,
    ...(translation ?? {}),
    product_name: translation?.product_name ?? product.product_name,
    generic_name: translation?.generic_name ?? product.generic_name,
    ingredients: translation?.ingredients ?? product.ingredients,
    origin: translation?.origin ?? product.origin,
  } satisfies Product & Partial<ProductTranslation>;
}
