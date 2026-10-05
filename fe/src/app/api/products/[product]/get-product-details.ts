import "server-only";

import { routing } from "@/i18n/routing";
import { supabase } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/generated/database.types";

type ProductRow = Pick<
  Tables<"products">,
  | "id"
  | "barcodes"
  | "brand"
  | "detail"
  | "grocer_id"
  | "name"
  | "size"
  | "unit"
>;

export type ProductSource = "new-world" | "paknsave" | "woolworths";
export type ProductDetailRecord = Record<string, unknown> & {
  source: ProductSource;
  detail: Record<string, unknown> | string;
};

export type ProductDetails = Omit<ProductRow, "detail"> & {
  detail: ProductDetailRecord | null;
  originalDetail: ProductDetailRecord | null;
  originalName: string | null;
  source: ProductSource | null;
  translationAvailable: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDetail(value: Json | null): ProductDetailRecord | null {
  const record = asRecord(value);
  if (!record || typeof record.source !== "string") return null;

  const source = record.source;
  if (
    source !== "new-world" &&
    source !== "paknsave" &&
    source !== "woolworths"
  ) {
    return null;
  }

  const detail = record.detail;
  if (
    source === "woolworths" &&
    typeof detail !== "string" &&
    !asRecord(detail)
  ) {
    return null;
  }
  if (source !== "woolworths" && !asRecord(detail)) return null;

  return { ...record, source, detail } as ProductDetailRecord;
}

export async function getProductDetails(
  productId: number,
  locale: string = routing.defaultLocale,
): Promise<ProductDetails | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, barcodes, brand, detail, grocer_id, name, size, unit")
    .eq("id", productId)
    .maybeSingle();

  if (error)
    throw new Error("Failed to load product details.", { cause: error });
  if (!data) return null;

  const detail = parseDetail(data.detail);

  const product: ProductDetails = {
    id: data.id,
    barcodes: data.barcodes,
    brand: data.brand,
    grocer_id: data.grocer_id,
    name: data.name,
    size: data.size,
    unit: data.unit,
    detail,
    originalDetail: null,
    originalName: null,
    source: detail?.source ?? null,
    translationAvailable: false,
  };

  if (locale === routing.defaultLocale) return product;

  const { data: translation, error: translationError } = await supabase
    .from("product_translations")
    .select("name, detail")
    .eq("product_id", productId)
    .eq("lang", locale)
    .maybeSingle();

  if (translationError) {
    throw new Error("Failed to load product translation.", {
      cause: translationError,
    });
  }

  if (!translation) return product;

  const translatedDetail = parseDetail(translation.detail);

  return {
    ...product,
    name: translation.name || product.name,
    detail: translatedDetail ?? detail,
    originalDetail:
      translatedDetail && detail && translatedDetail.source === detail.source
        ? detail
        : null,
    originalName:
      translation.name && translation.name !== product.name ? product.name : null,
    source: translatedDetail?.source ?? product.source,
    translationAvailable: true,
  };
}
