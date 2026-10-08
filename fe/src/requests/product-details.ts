import "server-only";

import type { ProductDetails } from "@/types/product-details";
import { apiFetch } from "./fetch";

export function requestProductDetails(productId: number, locale: string) {
  return apiFetch<ProductDetails>(`/api/products/${productId}`, {
    query: { locale },
  });
}
