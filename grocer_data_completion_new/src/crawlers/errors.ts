export class RetailerRequestError extends Error {
  readonly source: string;
  readonly barcode: string;
  readonly storeId: string | null;
  readonly storeName: string | null;
  readonly stage: "search" | "detail";

  constructor(
    message: string,
    fields: {
      source: string;
      barcode: string;
      storeId?: string | null;
      storeName?: string | null;
      stage: "search" | "detail";
    },
  ) {
    super(message);
    this.name = "RetailerRequestError";
    this.source = fields.source;
    this.barcode = fields.barcode;
    this.storeId = fields.storeId ?? null;
    this.storeName = fields.storeName ?? null;
    this.stage = fields.stage;
  }
}

export class PlatformUnavailableError extends Error {
  readonly productId: number;
  readonly source: string;

  constructor(
    productId: number,
    source: string,
    fields: {
      storeId: string | null;
      storeName: string | null;
      barcode: string;
      message: string;
    },
  ) {
    super(
      `[platform-error] productId=${productId} source=${source} storeId=${fields.storeId} storeName=${fields.storeName} barcode=${fields.barcode} ${fields.message}`,
    );
    this.name = "PlatformUnavailableError";
    this.productId = productId;
    this.source = source;
  }
}

export function wrapRetailerError(
  err: unknown,
  fields: ConstructorParameters<typeof RetailerRequestError>[1],
): RetailerRequestError {
  if (err instanceof RetailerRequestError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new RetailerRequestError(message, fields);
}
