import { BrandLink } from "./BrandLink";
import { DesktopNavigation } from "./DesktopNavigation";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  return (
    <header className="bg-brand-butter" aria-label="Site header">
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
