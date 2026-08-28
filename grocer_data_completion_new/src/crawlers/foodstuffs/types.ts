export type FoodstuffsRegion = "NI" | "SI";

export type FoodstuffsStore = {
  id: string;
  name: string;
  region: FoodstuffsRegion;
};

export type FoodstuffsSource = "new-world" | "paknsave";

export type FoodstuffsHeaderKey = "nwHeaders" | "paknsaveHeaders";

export type FoodstuffsPlatform = {
  source: FoodstuffsSource;
  origin: string;
  api: string;
  headerKey: FoodstuffsHeaderKey;
  stores: readonly FoodstuffsStore[];
  fastStoreIds: readonly string[];
};

export type AttemptStatus =
  | "matched"
  | "no-result"
  | "invalid-result"
  | "request-error"
  | "detail-error";

export type AttemptStage = "search" | "detail";

export type Attempt = {
  barcode: string;
  source: "woolworths" | FoodstuffsSource;
  storeId: string | null;
  storeName: string | null;
  stage: AttemptStage | null;
  status: AttemptStatus;
  resultCount: number;
  sku: string | null;
  candidateName: string | null;
  score: number | null;
  errorMessage: string | null;
};
