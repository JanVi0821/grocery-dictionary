"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInViewport, useMemoizedFn } from "ahooks";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Loading } from "@/components/Loading";
import {
  requestProductCommentCreate,
  requestProductComments,
} from "@/requests/comments";
import { isCommentHtmlEmpty, MAX_COMMENT_LENGTH } from "@/utils/comment-html";
import { useSupabaseBrowserClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { CommentItem } from "./CommentItem";

export function ProductComments({ productId }: { productId: number }) {
  const t = useTranslations("Product.comments");
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowserClient((state) => state.client);
  const [viewerId, setViewerId] = useState<string | null>();
  const [content, setContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (isMounted) setViewerId(data.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setViewerId(session?.user.id ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const commentsQuery = useInfiniteQuery({
    queryKey: ["product-comments", productId, viewerId],
    enabled: viewerId !== undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => requestProductComments(productId, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.currentPage < lastPage.pageCount
        ? lastPage.currentPage + 1
        : undefined,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const items = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = commentsQuery.data?.pages[0]?.totalCount ?? 0;
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = commentsQuery;
  const canSubmit =
    !isCommentHtmlEmpty(content) && content.length <= MAX_COMMENT_LENGTH;

  const loadNextPage = useMemoizedFn((entry: IntersectionObserverEntry) => {
    if (
      !entry.isIntersecting ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError
    ) {
      return;
    }

    void fetchNextPage({ cancelRefetch: false });
  });

  useInViewport(loadMoreRef, {
    rootMargin: "240px",
    callback: loadNextPage,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !canSubmit) return;

    setIsSubmitting(true);
    setResult(null);

    try {
      await requestProductCommentCreate(productId, content);
      setContent("");
      setEditorKey((key) => key + 1);
      setResult("success");
      await queryClient.invalidateQueries({
        queryKey: ["product-comments", productId, viewerId],
      });
    } catch {
      setResult("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="mt-section border-t border-border pt-section"
      aria-labelledby="product-comments-heading"
    >
      <h2
        id="product-comments-heading"
        className="text-base font-bold text-foreground"
      >
        {t("title")}
        {totalCount > 0 ? (
          <span className="font-normal text-foreground-muted"> ({totalCount})</span>
        ) : null}
      </h2>

      <form className="mt-copy-gap space-y-control-gap" onSubmit={handleSubmit}>
        <RichTextEditor
          key={editorKey}
          disabled={isSubmitting}
          onChange={(html) => {
            setContent(html);
            if (!isCommentHtmlEmpty(html)) setResult(null);
          }}
          placeholder={t("placeholder")}
        />
        <div className="flex flex-col gap-control-gap sm:flex-row sm:items-center sm:justify-end">
          {result ? (
            <p
              className={
                result === "error"
                  ? "text-label text-danger sm:mr-auto"
                  : "text-label text-foreground-muted sm:mr-auto"
              }
              aria-live="polite"
            >
              {result === "success" ? t("success") : t("error")}
            </p>
          ) : null}
          <button
            className="focus-ring inline-flex min-h-touch items-center justify-center gap-control-gap rounded-control bg-primary px-control-x text-label font-semibold text-primary-foreground hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !canSubmit}
            type="submit"
          >
            <Send aria-hidden="true" className="size-4" />
            <span>{isSubmitting ? t("submitting") : t("submit")}</span>
          </button>
        </div>
      </form>

      {commentsQuery.isPending ? (
        <Loading />
      ) : commentsQuery.isError && items.length === 0 ? (
        <p className="mt-copy-gap text-label leading-6 text-danger" role="alert">
          {t("loadFailed")}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-copy-gap text-label leading-6 text-foreground-muted">{t("empty")}</p>
      ) : (
        <>
          <ul className="mt-copy-gap divide-y divide-border border-t border-border">
            {items.map((item) => (
              <CommentItem key={item.id} productId={productId} comment={item} />
            ))}
          </ul>
          <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && <Loading />}
          {isFetchNextPageError && (
            <button
              type="button"
              onClick={() => void fetchNextPage({ cancelRefetch: false })}
              className="focus-ring mt-control-gap min-h-touch w-full text-center text-label leading-6 text-danger"
            >
              {t("loadFailedRetry")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
