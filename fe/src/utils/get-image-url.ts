import type { Tables } from "@/types/generated/database.types";

type ProductImageInput = Pick<Tables<"products">, "grocer_id">;

function getGrocerImageUrl({ grocer_id }: ProductImageInput) {
  if (!grocer_id) return null;

  const productId = grocer_id;
  if (
    (typeof productId !== "string" && typeof productId !== "number") ||
    !/^\d+$/.test(String(productId))
  ) {
    return null;
  }

  return `https://assets-prod.grocer.nz/public/product_images/product_${productId}.avif`;
}

export function getImageUrl(product: ProductImageInput) {
  return getGrocerImageUrl(product);
}
