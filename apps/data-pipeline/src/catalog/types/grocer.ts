export type GrocerRow = Record<string, unknown>;

export interface BarcodeRow extends GrocerRow {
  barcode: string;
  product_id: number;
}

export interface CollectionHierarchyRow extends GrocerRow {
  parent_id: number;
  child_id: number;
}

export interface CollectionMemberRow extends GrocerRow {
  collection_id: number;
  product_id: number;
}

export interface GrocerCollectionRow extends GrocerRow {
  id: number;
  name: string;
  is_comparable: boolean;
}

export interface MetaRow extends GrocerRow {
  updated_at: string;
}

export interface ProductRow extends GrocerRow {
  id: number;
  name: string;
  brand: string | null;
  unit: string;
  size: string | null;
  redirected_to: number | null;
}

export interface TableSpec {
  source: string;
  target: string;
  keyFields: readonly string[];
  fields: readonly string[];
  orderBy: string;
  id: (row: GrocerRow) => string;
}

export type ChangeType = "insert" | "update" | "restore" | "delete";

export interface SyncMetadata {
  status: "pending" | "processed";
  change_type: ChangeType;
  source_updated_at: string;
  batch_id: string;
  fetched_at: string;
  processed_at: string | null;
  deleted: boolean;
}

export interface GrocerDocument extends GrocerRow {
  _id: string;
  _sync?: SyncMetadata;
}
