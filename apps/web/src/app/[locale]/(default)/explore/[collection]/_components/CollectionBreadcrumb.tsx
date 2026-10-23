import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function CollectionBreadcrumb({
  items,
}: {
  items: { id: number; name: string }[];
}) {
  const t = await getTranslations("Explore");

  return (
    <nav className="mb-control-gap">
      <ol className="flex flex-wrap items-center text-label text-foreground-muted">
        <li className="flex items-center">
          <Link
            href="/explore"
            className="focus-ring inline-flex min-h-touch items-center rounded-control hover:text-foreground"
          >
            {t("title")}
          </Link>
        </li>
        {items.map((item, index) => {
          const current = index === items.length - 1;

          return (
            <li key={item.id} className="flex items-center">
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              {current ? (
                <span
                  className="inline-flex min-h-touch items-center font-semibold text-foreground"
                  aria-current="page"
                >
                  {item.name}
                </span>
              ) : (
                <Link
                  href={`/explore/${item.id}`}
                  className="focus-ring inline-flex min-h-touch items-center rounded-control hover:text-foreground"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
