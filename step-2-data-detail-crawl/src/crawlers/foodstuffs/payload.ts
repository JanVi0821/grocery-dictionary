import type { FoodstuffsStore } from "./types.ts";

export function foodstuffsSearchPayload(barcode: string, store: FoodstuffsStore) {
  const ni = store.region === "NI";
  return {
    algoliaQuery: {
      attributesToHighlight: [],
      attributesToRetrieve: [
        "productID",
        "Type",
        "sponsored",
        ni ? "category0NI" : "category0SI",
        ni ? "category1NI" : "category1SI",
        ni ? "category2NI" : "category2SI",
      ],
      facets: [
        "brand",
        ni ? "category1NI" : "category1SI",
        "onPromotion",
        "productFacets",
        "tobacco",
      ],
      filters: `stores:${store.id}`,
      highlightPostTag: "__/ais-highlight__",
      highlightPreTag: "__ais-highlight__",
      hitsPerPage: 50,
      maxValuesPerFacet: 100,
      page: 0,
      query: barcode,
      analyticsTags: ["fs#WEB:desktop"],
    },
    algoliaFacetQueries: [],
    storeId: store.id,
    hitsPerPage: 50,
    page: 0,
    sortOrder: ni ? "NI_POPULARITY_ASC" : "SI_POPULARITY_ASC",
    tobaccoQuery: true,
    precisionMedia: {
      adDomain: "SEARCH_PAGE",
      adPositions: [3, 6, 9],
      publishImpressionEvent: false,
      disableAds: false,
    },
  };
}
