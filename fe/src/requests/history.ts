import { apiFetch } from "./fetch";

export type HistoryListItem = {
  id: number;
  productId: number;
  barcode: string;
  createdAt: string;
  name: string | null;
  imageUrl: string | null;
};

export type HistoryResponse = {
  items: HistoryListItem[];
  currentPage: number;
  pageCount: number;
  totalCount: number;
};

export function requestHistory(page: number, locale: string) {
  return apiFetch<HistoryResponse>("/api/history", {
    cache: "no-store",
    query: { page, locale },
  });
}

export function requestHistoryDeletion(id: number) {
  return apiFetch<void>("/api/history", {
    method: "DELETE",
    cache: "no-store",
    query: { id },
  });
}
