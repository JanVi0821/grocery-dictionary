export const UNUSED_DETAIL_FIELDS = {
  foodstuffs: [
    "availability",
    "cateredFlag",
    "fsValidation",
    "fulfilmentOptions",
    "height",
    "marketingInitiatives",
    "marketingInitiativesList",
    "price",
    "productId",
    "promotionList",
    "promotions",
    "saleType",
    "sku",
    "width",
  ],
  woolworths: [
    "availabilityStatus",
    "changeOrderCheck",
    "context",
    "isSuccessful",
    "messages",
    "productDisclaimerMessage",
    "productStoresStockLevel",
    "productTags",
    "quantity",
    "rootUrl",
    "selectedPurchasingUnit",
    "shopperNotes",
  ],
} as const;

export const UNUSED_WOOLWORTHS_PRICE_FIELDS = [
  "averagePricePerSingleUnit",
  "canShowOriginalPrice",
  "canShowSavings",
  "currentPricingMatchesOrderedPricing",
  "discount",
  "extendedListPrice",
  "hasBonusPoints",
  "isBoostOffer",
  "isClubPrice",
  "isNew",
  "isSpecial",
  "isTargetedOffer",
  "isUsingOrderedPrice",
  "orderedPrice",
  "originalAveragePricePerSingleUnit",
  "promotionEndDate",
  "promotionStartDate",
  "purchasingUnitPrice",
  "salePrice",
  "savePercentage",
  "savePrice",
  "total",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function omitFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  const result = { ...value };
  for (const field of fields) delete result[field];
  return result;
}

export function removeUnusedDetailFields(source: string, detail: unknown) {
  const record = asRecord(detail);
  if (!record) return detail;

  if (source === "new-world" || source === "paknsave") {
    return omitFields(record, UNUSED_DETAIL_FIELDS.foodstuffs);
  }

  if (source !== "woolworths") return detail;

  const result = omitFields(record, UNUSED_DETAIL_FIELDS.woolworths);
  const price = asRecord(result.price);
  if (price) {
    result.price = omitFields(price, UNUSED_WOOLWORTHS_PRICE_FIELDS);
  }
  return result;
}
