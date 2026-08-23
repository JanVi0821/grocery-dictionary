import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { navigationItems } from "@/consts/navigation-items";

export async function DesktopNavigation() {
  const t = await getTranslations("Navigation");

  return (
    <nav
      className="hidden flex-1 justify-center lg:flex"
      aria-label={t("primaryLabel")}
    >
      <ul className="flex items-center gap-control-gap">
        {navigationItems.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="focus-ring flex min-h-touch items-center gap-control-gap rounded-pill px-control-x text-label font-semibold text-foreground-muted hover:text-foreground"
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
