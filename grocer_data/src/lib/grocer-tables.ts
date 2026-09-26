import type { GrocerRow, TableSpec } from "../types/grocer.js";

function table(
  source: string,
  target: string,
  keyFields: readonly string[],
  fields: readonly string[],
  customId?: (row: GrocerRow) => string,
): TableSpec {
  return {
    source,
    target,
    keyFields,
    fields,
    orderBy: keyFields.join(", "),
    id: customId ?? ((row) => keyFields.map((field) => String(row[field])).join(":")),
  };
}

export const GROCER_TABLES: readonly TableSpec[] = [
  table("public_barcodes", "grocer_public_barcodes", ["barcode", "product_id"], ["barcode", "product_id"]),
  table("public_collection_hierarchy", "grocer_public_collection_hierarchy", ["parent_id", "child_id"], ["parent_id", "child_id"]),
  table("public_collection_members", "grocer_public_collection_members", ["collection_id", "product_id"], ["collection_id", "product_id"]),
  table("public_collections", "grocer_public_collections", ["id"], ["id", "name", "is_comparable"]),
  table("public_meta", "grocer_public_meta", ["updated_at"], ["updated_at"], () => "snapshot"),
  table("public_products", "grocer_public_products", ["id"], ["id", "name", "brand", "unit", "size", "redirected_to"]),
];
