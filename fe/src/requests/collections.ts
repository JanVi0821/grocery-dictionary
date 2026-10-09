import { apiFetch } from "./fetch";

export type CollectionProductItem = {
  id: number;
  name: string | null;
  originalName: string | null;
  brand: string | null;
  imageUrl: string | null;
};

export type CollectionProductsResponse = {
  items: CollectionProductItem[];
  pageSize: number;
};

export function requestCollectionProducts(
  collectionId: number,
  after: number | null,
  locale: string,
) {
  return apiFetch<CollectionProductsResponse>(
    `/api/collections/${collectionId}/products`,
    {
      cache: "no-store",
      query: { after, locale },
    },
  );
}
