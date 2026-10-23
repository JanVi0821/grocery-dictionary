/**
 * Persisted grocery detail payloads after unused source fields are removed.
 * The original shapes were inferred from MongoDB data_completion records with
 * needsReview=false on 2026-09-09.
 *
 * A property is optional when it was absent from at least one observed payload.
 * A required nullable property was present in every payload but sometimes null.
 */

export type FoodstuffsProductDetail = {
  "allergenStatement"?: string;
  "brand"?: string;
  "categories"?: string[];
  "categoryTrees"?: Array<{
    "appContent"?: {
      "badgeLargeUrl": string;
      "badgeMediumUrl": string;
      "badgeSmallUrl": string;
      "campaignUrl": string;
      "subTitle": string;
      "title": string;
    };
    "level0": string;
    "level1": string;
    "level2": string;
    "webContent"?: {
      "badgeLargeUrl": string;
      "badgeMediumUrl": string;
      "badgeSmallUrl": string;
      "campaignUrl": string;
      "subTitle": string;
      "title": string;
    };
  }>;
  "comparativePricePerUnit"?: number;
  "comparativeUnitMeasureDescription"?: string;
  "comparativeUnitQuantity"?: number;
  "comparativeUnitQuantityUoM"?: string;
  "description"?: string;
  "displayName"?: string;
  "facets"?: Array<{
    "itemCode": string;
    "itemDescription": string;
  }>;
  "fsContainsAllergenStatement"?: string;
  "fsIngredientStatement"?: string;
  "fsSupplementaryAllergenStatement"?: string;
  "images": {
    "alternateImages": Array<{
      "angle"?: string;
      "contentType": string;
      "facing"?: string;
      "height": number;
      "state"?: string;
      "url": string;
      "width": number;
    }>;
    "primaryImages"?: {
      "100px": string;
      "200px": string;
      "300px": string;
      "400px": string;
      "500px": string;
    };
  };
  "ingredientStatement"?: string;
  "inStoreMadeProduct"?: boolean;
  "liquorFlag"?: boolean;
  "name": string;
  "netContent"?: number;
  "netContentUOM"?: string;
  /** Price in minor currency units (cents). */
  "nonLoyaltyCardPrice": number;
  "nutritionalInfo"?: {
    "noServesPerPack"?: number;
    "nutrientHealthStarValues"?: Array<{
      "healthStarValue": string;
      "nutrient": string;
    }>;
    "nutrients"?: Array<{
      "dailyIntake"?: number;
      "measurementPrecision": string;
      "nutrientBasisQty": number;
      "nutrientBasisQtyUom": string;
      "nutrientBasisQuantityType": string;
      "nutrientType": string;
      "nutrientTypeDescription": string;
      "nutrientUom": string;
      "preparationState": string;
      "qtyContained": number;
      "servingSizeDescription"?: string;
      "servingSizes": Array<{
        "uomToValue": {
          "uom": string;
          "value": number;
        };
      }>;
    }>;
  };
  "originRegulated": boolean;
  "originStatement"?: string;
  "restrictedFlag": boolean;
  "tobaccoFlag"?: boolean;
  "unitOfMeasure": string;
  "warningCopyDescription"?: string;
  "weighable": {
    "avgWeightPerUnit"?: number;
    "avgWeightUoM"?: string;
    "minOrderQty"?: number;
    "stepSize"?: number;
  };
};

export type WoolworthsNutritionRow = {
  "columns": (string | null)[];
  "rows": WoolworthsNutritionRow[] | null;
};

export type WoolworthsProductDetail = {
  "alcohol": number | null;
  "allergenMaybePresent": string | null;
  "allergens": string[] | null;
  "averageWeightPerUnit": number;
  "bigImageUrl": string;
  "brand": string;
  "breadcrumb": {
    "aisle": {
      "group": null;
      "isBooleanValue": boolean;
      "key": string;
      "name": string;
      "productCount": number;
      "shelfResponses": null;
      "value": number;
    };
    "department": {
      "group": null;
      "isBooleanValue": boolean;
      "key": string;
      "name": string;
      "productCount": number;
      "shelfResponses": null;
      "value": number;
    };
    "dynamicGroup": null;
    "productGroup": null;
    "shelf": {
      "group": null;
      "isBooleanValue": boolean;
      "key": string;
      "name": string;
      "productCount": number;
      "shelfResponses": null;
      "value": number;
    };
  } | null;
  "claims": string[] | null;
  "contents": string[] | null;
  "description": string | null;
  "directions": string | null;
  "endorsements": string[] | null;
  "genericName": string;
  "healthStarRating": number;
  "images": Array<{
    "big": string;
    "small": string;
  }>;
  "ingredients": {
    "footnotes": string[] | null;
    "ingredients": string[];
  } | null;
  "isAgeRestricted": boolean;
  "isTobaccoProduct": boolean;
  "name": string;
  "nutrition": Array<{
    "columnHeaders": Array<{
      "name": string;
      "suffix": string | null;
    }>;
    "footnotes": Array<{
      "displayText": string;
      "prefix": string | null;
    }>;
    "rows": WoolworthsNutritionRow[];
    "servings": string;
  } | null> | null;
  "nutritionVerificationMessage": {
    "isSupplierProvidedData": boolean;
    "releasedOn": string | null;
    "suppliedBy": string;
    "verifiedOn": string | null;
  } | null;
  "origins": string[] | null;
  /** Woolworths prices are represented in major currency units (NZD). */
  "price": {
    "originalPrice": number;
  };
  "servingSuggestion": string | null;
  "size": {
    "cupListPrice": number;
    "cupMeasure": string | null;
    "cupPrice": number;
    "packageType": string | null;
    "volumeSize": string | null;
  };
  "sku": string;
  "smallImageUrl": string;
  "supportsBothEachAndKgPricing": boolean;
  "unit": string;
  "variety": string | null;
  "warnings": string[] | null;
};

/** New World and PAK'nSAVE currently return the same Foodstuffs API shape. */
export type NewWorldProductDetail = FoodstuffsProductDetail;
export type PaknsaveProductDetail = FoodstuffsProductDetail;

/**
 * Four completed Woolworths records currently contain an HTML response string
 * instead of the expected JSON object, so stored data must retain this branch.
 */
export type WoolworthsStoredDetail = WoolworthsProductDetail | string;

export interface GrocerDetailBySource {
  "new-world": NewWorldProductDetail;
  paknsave: PaknsaveProductDetail;
  woolworths: WoolworthsStoredDetail;
}

export type GrocerSource = keyof GrocerDetailBySource;

export type GrocerDetail<Source extends GrocerSource> =
  GrocerDetailBySource[Source];

/** A discriminated source/detail pair for completed MongoDB records. */
export type CompletedGrocerDetail = {
  [Source in GrocerSource]: {
    source: Source;
    needsReview: false;
    detail: GrocerDetailBySource[Source];
  };
}[GrocerSource];
