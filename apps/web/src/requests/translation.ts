import { apiFetch } from "./fetch";
import type { TranslationField } from "@/utils/translation-fields";

export type ProductTranslationFields = {
  fields: TranslationField[];
};

export function requestProductTranslationFields(productId: number, locale: string) {
  return apiFetch<ProductTranslationFields>(`/api/products/${productId}/translation`, {
    cache: "no-store",
    query: { locale },
  });
}

export function requestProductTranslationUpdate(
  productId: number,
  locale: string,
  key: string,
  value: string,
) {
  return apiFetch<TranslationField>(`/api/products/${productId}/translation`, {
    method: "PATCH",
    json: { locale, key, value },
  });
}
