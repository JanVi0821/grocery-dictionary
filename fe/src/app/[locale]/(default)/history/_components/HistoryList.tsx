"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { BaseImage } from "@/components/image";
import { Loading } from "@/components/Loading";
import {
  requestHistory,
  requestHistoryDeletion,
} from "@/requests/history";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HistoryList({ locale }: { locale: string }) {
  const t = useTranslations("History");
  const activeLocale = useLocale();
  const queryClient = useQueryClient();
  const [errorId, setErrorId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const historyQuery = useInfiniteQuery({
    queryKey: ["product-search-history", locale],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => requestHistory(pageParam, locale),
    getNextPageParam: (lastPage) =>
      lastPage.currentPage < lastPage.pageCount
        ? lastPage.currentPage + 1
        : undefined,
  });
  const items = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = historyQuery;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !isFetchingNextPage &&
          !isFetchNextPageError
        ) {
          void fetchNextPage({ cancelRefetch: false });
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  const dateFormatter = new Intl.DateTimeFormat(
    activeLocale === "zh" ? "zh-CN" : "en-NZ",
    { dateStyle: "medium", timeStyle: "short" },
  );

  function handleDelete(id: number) {
    setErrorId(null);
    startTransition(async () => {
      try {
        await requestHistoryDeletion(id);
        await queryClient.invalidateQueries({
          queryKey: ["product-search-history", locale],
        });
      } catch {
        setErrorId(id);
      }
    });
  }

  if (historyQuery.isPending) {
    return <Loading />;
  }

  if (historyQuery.isError && items.length === 0) {
    return (
      <p className="mt-control-gap text-body text-danger" role="alert">
        {t("loadFailed")}
      </p>
    );
  }

  if (historyQuery.data && items.length === 0) {
    return (
      <p className="mt-control-gap text-body text-foreground-muted">
        {t("empty")}
      </p>
    );
  }

  return (
    <>
      <ul className="mt-control-gap space-y-control-gap">
        {items.map((item) => {
          const itemName = item.name ?? t("productUnavailable");

          return (
            <li key={item.id}>
              <article className="flex items-center gap-control-gap rounded-control border border-border bg-surface p-control-gap transition-colors hover:bg-surface-muted focus-within:bg-surface-muted">
                <Link
                  href={`/product/${item.productId}`}
                  className="focus-ring flex min-h-touch min-w-0 flex-1 items-center gap-control-gap rounded-control"
                >
                  <BaseImage
                    src={item.imageUrl}
                    alt=""
                    width={64}
                    height={64}
                    sizes="64px"
                    fallbackLabel={undefined}
                    className="size-16 shrink-0 rounded-control object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-semibold text-foreground">
                      {itemName}
                    </span>
                    {item.originalName ? (
                      <span className="mt-1 block line-clamp-2 text-xs font-normal text-foreground-muted">
                        {item.originalName}
                      </span>
                    ) : null}
                    {item.brand ? (
                      <span className="mt-1 block truncate text-label text-foreground-muted">
                        {item.brand}
                      </span>
                    ) : null}
                    <time
                      dateTime={item.createdAt}
                      className="mt-1 block text-label text-foreground-muted"
                    >
                      {dateFormatter.format(new Date(item.createdAt))}
                    </time>
                  </span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="grid size-touch shrink-0 place-items-center rounded-control text-foreground-muted cursor-pointer"
                    aria-label={t("itemActions", { name: itemName })}
                    disabled={isPending}
                  >
                    <MoreHorizontal
                      className="size-nav-icon"
                      aria-hidden="true"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="gap-control-gap cursor-pointer text-danger focus:text-danger"
                    >
                      <Trash2 className="size-nav-icon" aria-hidden="true" />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </article>
              {errorId === item.id && (
                <p className="mt-1 text-label text-danger" role="alert">
                  {t("deleteFailed")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
      {isFetchingNextPage && <Loading />}
      {isFetchNextPageError && (
        <button
          type="button"
          onClick={() => void fetchNextPage({ cancelRefetch: false })}
          className="focus-ring mt-control-gap min-h-touch w-full text-center text-body text-danger"
        >
          {t("loadFailedRetry")}
        </button>
      )}
    </>
  );
}
