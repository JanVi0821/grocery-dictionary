import { apiFetch } from "./fetch";

export type ProductComment = {
  id: number;
  content: string;
  authorName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  owned: boolean;
};

export type ProductCommentsResponse = {
  items: ProductComment[];
  currentPage: number;
  pageCount: number;
  totalCount: number;
};

export function requestProductComments(productId: number, page: number) {
  return apiFetch<ProductCommentsResponse>(
    `/api/products/${productId}/comments`,
    {
      cache: "no-store",
      query: { page },
    },
  );
}

export function requestProductCommentCreate(productId: number, content: string) {
  return apiFetch<ProductComment>(`/api/products/${productId}/comments`, {
    method: "POST",
    json: { content },
  });
}

export function requestProductCommentDelete(productId: number, commentId: number) {
  return apiFetch<void>(`/api/products/${productId}/comments`, {
    method: "DELETE",
    query: { id: commentId },
  });
}
