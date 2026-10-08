import { getTranslations } from "next-intl/server";
import { BrandLink } from "./BrandLink";
import { DesktopNavigation } from "./DesktopNavigation";
import { LanguageSelector } from "./LanguageSelector";
import { AuthControl } from "./AuthControl";

export async function SiteHeader() {
  const t = await getTranslations("Layout");

  return (
    <header className="bg-brand-butter" aria-label={t("siteHeader")}>
      <div className="mx-auto flex h-header w-full max-w-content items-center gap-2 px-page-x sm:gap-page-x">
        <div className="flex min-w-0 flex-1 items-center">
          <BrandLink />
        </div>
        <DesktopNavigation />
        <div className="flex flex-none items-center justify-end gap-1 sm:flex-1 sm:gap-control-gap">
          <LanguageSelector />
          <AuthControl />
        </div>
      </div>
    </header>
  );
}
