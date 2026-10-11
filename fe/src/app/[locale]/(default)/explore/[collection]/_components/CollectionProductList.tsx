"use client";

import { useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { BaseImage } from "@/components/image";
import { Loading } from "@/components/Loading";
import { requestCollectionProducts } from "@/requests/collections";
import { CollectionPagination } from "./CollectionPagination";

export function CollectionProductList({
  collectionId,
  locale,
  page,
}: {
  collectionId: number;
  locale: string;
  page: number;
}) {
  const t = useTranslations("Explore");
  const router = useRouter();
  const productsQuery = useQuery({
    queryKey: ["collection-products", collectionId, locale, page],
    queryFn: () => requestCollectionProducts(collectionId, page, locale),
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const data = productsQuery.data;
  const resolvedPage = productsQuery.isPlaceholderData ? undefined : data?.currentPage;

  useEffect(() => {
    if (resolvedPage === undefined || resolvedPage === page) return;

    router.replace(
      resolvedPage === 1
        ? `/explore/${collectionId}`
        : { pathname: `/explore/${collectionId}`, query: { page: resolvedPage } },
    );
  }, [collectionId, page, resolvedPage, router]);

  if (productsQuery.isPending) {
    return <Loading />;
  }

  if (productsQuery.isError || !data) {
    return (
      <p className="mt-control-gap text-body text-danger" role="alert">
        {t("productsLoadFailed")}
      </p>
    );
  }

  if (data.items.length === 0) {
    return (
      <p className="mt-control-gap text-body text-foreground-muted">
        {t("productsEmpty")}
      </p>
    );
  }

  return (
    <>
      <ul
        className={clsx(
          "mt-control-gap space-y-control-gap transition-opacity",
          productsQuery.isPlaceholderData && "opacity-60",
        )}
      >
        {data.items.map((item) => {
          const itemName = item.name ?? t("productUnavailable");

          return (
            <li key={item.id}>
              <article className="flex items-center gap-control-gap rounded-control border border-border bg-surface p-control-gap transition-colors hover:bg-surface-muted focus-within:bg-surface-muted">
                <Link
                  href={`/product/${item.id}`}
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
      <CollectionPagination
        collectionId={collectionId}
        currentPage={productsQuery.isPlaceholderData ? page : data.currentPage}
        pageCount={data.pageCount}
      />
    </>
  );
}
