import { wwSearchUrl } from "./headers.ts";

export const WW_SEARCH = "ww:search";

export function createWoolworthTask(
  name: string,
  productId: number,
  barcodes: string[] = [],
  brand: unknown = null,
) {
  return {
    url: wwSearchUrl(name),
    label: WW_SEARCH,
    skipNavigation: true as const,
    uniqueKey: `ww:${productId}`,
    userData: { name, productId, barcodes, brand },
  };
}
