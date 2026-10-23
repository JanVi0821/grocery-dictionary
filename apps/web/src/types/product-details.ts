export type ProductSource = "new-world" | "paknsave" | "woolworths";

export type ProductDetailRecord = Record<string, unknown> & {
  source: ProductSource;
  detail: Record<string, unknown> | string;
};

export type ProductDetails = {
  id: number;
  barcodes: string[];
  brand: string | null;
  grocer_id: number;
  name: string;
  size: string | null;
  unit: string;
  detail: ProductDetailRecord | null;
  originalDetail: ProductDetailRecord | null;
  originalName: string | null;
  source: ProductSource | null;
  translationAvailable: boolean;
};
