/**
 * Raw grocery detail payloads inferred from every MongoDB data_completion
 * record with needsReview=false on 2026-09-09.
 *
 * A property is optional when it was absent from at least one observed payload.
 * A required nullable property was present in every payload but sometimes null.
 */

export type FoodstuffsProductDetail = {
  "allergenStatement"?: string;
  "availability": string[];
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
  "cateredFlag": boolean;
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
  "fsValidation"?: {
    "allergens": {
      "pealStatus": string;
      "status": string;
    };
  };
  "fulfilmentOptions": Array<{
    "available": boolean;
    "collectionPointType"?: string;
    "method": string;
  }>;
  "height": number;
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
  "marketingInitiatives"?: {
    "decals": string[];
  };
  "marketingInitiativesList"?: Array<{
    "initiativeCode": string;
    "themeCode"?: string;
  }>;
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
  /** Current price in minor currency units (cents). */
  "price": number;
  "productId": string;
  "promotionList"?: Array<{
    "baseDescription"?: string;
    "cardDependencyFlag": boolean;
    "decal": string;
    "description"?: string;
    "endDate": string;
    "multiProducts": boolean;
    "offerId"?: string;
    "onlineBasket": boolean;
    "promoId": string;
    "promotionActivationLimit"?: number;
    "promotionClass"?: string;
    "promotionId": number;
    "promotionRewards": Array<{
      "promotionConditions": Array<{
        "nextThresholdQuantity": number;
        "productLinkGroupType": string;
        "productLinks": Array<{
          "brand"?: string;
          "comparativePrice"?: {
            "measureDescription": string;
            "pricePerUnit": number;
            "unitQuantity": number;
            "unitQuantityUom": string;
          };
          "displayName": string;
          "name": string;
          "productId": string;
        }>;
        "promoConditionGroupType": string;
        "thresholdQuantity": number;
        "thresholdUom": string;
      }>;
      "rewardValue": number;
    }>;
    "promotionType"?: string;
    "rewardType": string;
    "sapPromotionType": string;
    "startDate": string;
    "suspended": boolean;
    "terms"?: string;
    "ticketDescription": string;
  }>;
  "promotions"?: {
    "decals": string[];
    "limit": number[];
    "multibuyDescription"?: string;
    "priceValidityFreeFormText": string;
    "promoId": string[];
    "promotionId": number[];
  };
  "restrictedFlag": boolean;
  "saleType": string;
  "sku": string;
  "tobaccoFlag"?: boolean;
  "unitOfMeasure": string;
  "warningCopyDescription"?: string;
  "weighable": {
    "avgWeightPerUnit"?: number;
    "avgWeightUoM"?: string;
    "minOrderQty"?: number;
    "stepSize"?: number;
  };
  "width": number;
};

export type WoolworthsNutritionRow = {
  "columns": (string | null)[];
  "rows": WoolworthsNutritionRow[] | null;
};

export type WoolworthsProductDetail = {
  "alcohol": number | null;
  "allergenMaybePresent": string | null;
  "allergens": string[] | null;
  "availabilityStatus": string;
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
  "changeOrderCheck": null;
  "claims": string[] | null;
  "contents": string[] | null;
  "context": {
    "advancedSettingsResponse": null;
    "basketTotals": null;
    "enabledFeatures": string[];
    "fulfilment": {
      "address": string;
      "areaId": number;
      "cutOffTime": null;
      "endTime": null;
      "expressFulfilment": {
        "expressDeliveryFee": null;
        "expressPickUpFee": null;
        "flexibleDeliveryFee": null;
        "isExpressSlot": boolean;
        "isFlexibleDeliverySlot": boolean;
      };
      "fulfilmentStoreId": number;
      "isAddressInDeliveryZone": boolean;
      "isDefaultDeliveryAddress": boolean;
      "isSlotToday": boolean;
      "locker": null;
      "method": string;
      "perishableCode": string;
      "pickupAddressId": number;
      "selectedDate": null;
      "selectedDateWithTZInfo": null;
      "startTime": null;
      "suburbId": number;
    };
    "shopper": {
      "changingOrderId": null;
      "firstName": null;
      "hasActiveDeliverySubscription": boolean;
      "hasOnecard": boolean;
      "isChangingOrder": boolean;
      "isLoggedIn": boolean;
      "isPriorityShopper": boolean;
      "isShopper": boolean;
      "isSupplyLimitOverrideShopper": boolean;
      "isWPayDeliverySubscription": boolean;
      "oneCardBalance": null;
      "orderCount": null;
      "sessionGroups": null;
      "shopperIdHash": null;
      "shopperScvId": string;
    };
    "shoppingListItems": unknown[];
  };
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
  "isSuccessful": boolean;
  "isTobaccoProduct": boolean;
  "messages": null;
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
    "averagePricePerSingleUnit": number | null;
    "canShowOriginalPrice": boolean;
    "canShowSavings": boolean;
    "currentPricingMatchesOrderedPricing": null;
    "discount": null;
    "extendedListPrice": null;
    "hasBonusPoints": boolean;
    "isBoostOffer": boolean;
    "isClubPrice": boolean;
    "isNew": boolean;
    "isSpecial": boolean;
    "isTargetedOffer": boolean;
    "isUsingOrderedPrice": boolean;
    "orderedPrice": null;
    "originalAveragePricePerSingleUnit": null;
    "originalPrice": number;
    "promotionEndDate": string | null;
    "promotionStartDate": string | null;
    "purchasingUnitPrice": null;
    "salePrice": number;
    "savePercentage": number;
    "savePrice": number;
    "total": null;
  };
  "productDisclaimerMessage": string;
  "productStoresStockLevel": null;
  "productTags": Array<{
    "additionalTag": {
      "altText": string | null;
      "imagePath": string;
      "link": string | null;
      "linkTarget": string;
      "name": string;
    } | null;
    "bonusPoints": null;
    "boostOffer": null;
    "multiBuy": {
      "link": string;
      "multiCupValue": number;
      "quantity": number;
      "value": number;
    } | null;
    "tagType": string;
    "targetedOffer": null;
  }>;
  "quantity": {
    "increment": number;
    "max": number;
    "min": number;
    "purchasingQuantityString": null;
    "quantityInOrder": null;
    "value": number;
  };
  "rootUrl": string;
  "selectedPurchasingUnit": null;
  "servingSuggestion": string | null;
  "shopperNotes": string;
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
