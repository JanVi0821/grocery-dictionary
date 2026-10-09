import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { navigationItems } from "@/consts/navigation-items";

export async function DesktopNavigation() {
  const t = await getTranslations("Navigation");

  return (
    <nav className="hidden shrink-0 lg:flex" aria-label={t("primaryLabel")}>
      <ul className="flex items-center gap-control-gap">
        {navigationItems.map(({ href, label, icon: Icon }) => (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              className="focus-ring flex min-h-touch shrink-0 items-center gap-control-gap whitespace-nowrap rounded-pill px-control-x text-label font-semibold text-foreground-muted hover:text-foreground"
            >
              <Icon className="size-nav-icon shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{t(label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
