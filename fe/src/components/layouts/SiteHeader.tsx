import { getTranslations } from "next-intl/server";
import { BrandLink } from "./BrandLink";
import { DesktopNavigation } from "./DesktopNavigation";
import { LanguageSelector } from "./LanguageSelector";

export async function SiteHeader() {
  const t = await getTranslations("Layout");

  return (
    <header className="bg-brand-butter" aria-label={t("siteHeader")}>
      <div className="mx-auto flex h-header w-full max-w-content items-center gap-page-x px-page-x">
        <div className="flex flex-1 items-center">
          <BrandLink />
        </div>
        <DesktopNavigation />
        <LanguageSelector />
      </div>
    </header>
  );
}
