import { normalizeBarcode } from "../../barcodes.ts";

export type SearchItem = {
  name?: string;
  sku?: string;
  brand?: string;
  stockcode?: string | number;
  barcode?: string;
};

export function itemSku(item: SearchItem) {
  return String(item.sku ?? item.stockcode ?? "");
}

export function findWoolworthByBarcode(items: SearchItem[], barcode: string) {
  return items.find(
    (item) => item.barcode != null && normalizeBarcode(item.barcode) === barcode,
  );
}
