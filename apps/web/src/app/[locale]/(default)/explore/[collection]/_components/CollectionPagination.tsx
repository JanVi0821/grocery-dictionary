import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

function pageHref(collectionId: number, page: number) {
  return page === 1
    ? `/explore/${collectionId}`
    : { pathname: `/explore/${collectionId}`, query: { page } };
}

function visiblePages(currentPage: number, pageCount: number) {
  const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);

  return sorted.flatMap((page, index) =>
    index > 0 && page - sorted[index - 1] > 1 ? [null, page] : [page],
  );
}

const DISABLED_CLASS = "pointer-events-none opacity-40";

export function CollectionPagination({
  collectionId,
  currentPage,
  pageCount,
}: {
  collectionId: number;
  currentPage: number;
  pageCount: number;
}) {
  const t = useTranslations("Explore");

  if (pageCount <= 1) return null;

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < pageCount;

  return (
    <Pagination className="mt-section">
      <PaginationContent className="gap-1">
        <PaginationItem>
          <PaginationPrevious
            text={t("previousPage")}
            href={pageHref(collectionId, hasPrevious ? currentPage - 1 : 1)}
            className={cn("min-h-touch", !hasPrevious && DISABLED_CLASS)}
          />
        </PaginationItem>
        <PaginationItem className="px-2 text-label font-semibold text-foreground sm:hidden">
          {currentPage} / {pageCount}
        </PaginationItem>
        {visiblePages(currentPage, pageCount).map((page, index) => (
          <PaginationItem key={page ?? `gap-${index}`} className="hidden sm:block">
            {page === null ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={pageHref(collectionId, page)}
                isActive={page === currentPage}
                className="min-h-touch min-w-touch"
              >
                {page}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            text={t("nextPage")}
            href={pageHref(collectionId, hasNext ? currentPage + 1 : pageCount)}
            className={cn("min-h-touch", !hasNext && DISABLED_CLASS)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
