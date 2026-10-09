"use client";

import { useRef } from "react";
import { useInViewport, useMemoizedFn } from "ahooks";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import { BaseImage } from "@/components/image";
import { Loading } from "@/components/Loading";
import { requestCollectionProducts } from "@/requests/collections";

export function CollectionProductList({
  collectionId,
  locale,
}: {
  collectionId: number;
  locale: string;
}) {
  const t = useTranslations("Explore");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const productsQuery = useInfiniteQuery({
    queryKey: ["collection-products", collectionId, locale],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      requestCollectionProducts(collectionId, pageParam, locale),
    getNextPageParam: (lastPage) =>
      lastPage.items.length === lastPage.pageSize
        ? lastPage.items.at(-1)?.id
        : undefined,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const items = productsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = productsQuery;

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

  if (productsQuery.isPending) {
    return <Loading />;
  }

  if (productsQuery.isError && items.length === 0) {
    return (
      <p className="mt-control-gap text-body text-danger" role="alert">
        {t("productsLoadFailed")}
      </p>
    );
  }

  if (productsQuery.data && items.length === 0) {
    return (
      <p className="mt-control-gap text-body text-foreground-muted">
        {t("productsEmpty")}
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
                  href={`/product/${item.id}`}
                  prefetch={false}
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
                    {item.brand ? (
                      <span className="block truncate text-label text-foreground-muted">
                        {item.brand}
                      </span>
                    ) : null}
                    <span className="line-clamp-2 font-semibold text-foreground">
                      {itemName}
                    </span>
                    {item.originalName ? (
                      <span className="mt-1 block line-clamp-2 text-xs font-normal text-foreground-muted">
                        {item.originalName}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </article>
            </li>
          );
        })}
      </ul>
      <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
      {isFetchingNextPage && <Loading />}
      {isFetchNextPageError && (
        <button
          type="button"
          onClick={() => void fetchNextPage({ cancelRefetch: false })}
          className="focus-ring mt-control-gap min-h-touch w-full text-center text-body text-danger"
        >
          {t("productsLoadFailedRetry")}
        </button>
      )}
    </>
  );
}
