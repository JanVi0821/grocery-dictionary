import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { navigationItems } from "@/consts/navigation-items";

export async function MobileNavigation() {
  const t = await getTranslations("Navigation");

  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface lg:hidden"
      aria-label={t("primaryLabel")}
    >
      <ul className="mx-auto grid w-full max-w-content grid-cols-3 gap-control-gap px-page-x pt-page-x">
        {navigationItems.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="focus-ring flex min-h-touch flex-col items-center justify-center gap-control-gap rounded-control text-label font-semibold text-foreground-muted hover:text-foreground"
            >
              <Icon className="size-nav-icon" aria-hidden="true" />
              <span>{t(label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
