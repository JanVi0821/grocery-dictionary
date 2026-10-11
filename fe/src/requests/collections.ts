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
  totalCount: number;
  pageCount: number;
  currentPage: number;
};

export function requestCollectionProducts(
  collectionId: number,
  page: number,
  locale: string,
) {
  return apiFetch<CollectionProductsResponse>(
    `/api/collections/${collectionId}/products`,
    {
      cache: "no-store",
      query: { page, locale },
    },
  );
}
