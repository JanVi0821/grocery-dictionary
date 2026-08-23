"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ScribbleSelect,
  ScribbleSelectContent,
  ScribbleSelectItem,
  ScribbleSelectTrigger,
  ScribbleSelectValue,
} from "@/components/scribble-ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

export function LanguageSelector() {
  const t = useTranslations("Language");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextLocale: string) {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale as AppLocale });
    });
  }

  return (
    <div className="flex flex-1 justify-end">
      <label className="sr-only" htmlFor="language-selector">
        {t("label")}
      </label>
      <ScribbleSelect
        value={locale}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <ScribbleSelectTrigger
          id="language-selector"
          className="focus-ring h-auto min-h-touch w-auto min-w-max bg-surface px-control-x text-label font-medium text-foreground shadow-control"
          aria-busy={isPending}
        >
          <ScribbleSelectValue />
        </ScribbleSelectTrigger>
        <ScribbleSelectContent
          align="end"
          className="bg-surface text-foreground shadow-raised"
        >
          {routing.locales.map((item) => (
            <ScribbleSelectItem
              key={item}
              value={item}
              className="min-h-touch text-label text-foreground data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground"
            >
              {item === "en" ? t("english") : t("simplifiedChinese")}
            </ScribbleSelectItem>
          ))}
        </ScribbleSelectContent>
      </ScribbleSelect>
    </div>
  );
}
