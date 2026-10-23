import { apiFetch } from "./fetch";

export type ProductLookupResponse = { productId: number };

export function requestProductByBarcode(barcode: string) {
  return apiFetch<ProductLookupResponse>("/api/products", {
    query: { barcode },
  });
}
