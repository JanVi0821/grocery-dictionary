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

export function LanguageSelector({
  variant = "header",
}: {
  variant?: "header" | "settings";
}) {
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

  const selectorId =
    variant === "settings" ? "settings-language-selector" : "language-selector";
  const isSettings = variant === "settings";

  return (
    <div className={isSettings ? "w-full sm:w-56" : "shrink-0"}>
      <label className="sr-only" htmlFor={selectorId}>
        {t("label")}
      </label>
      <ScribbleSelect
        value={locale}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <ScribbleSelectTrigger
          id={selectorId}
          aria-labelledby={isSettings ? "settings-language-title" : undefined}
          className={
            isSettings
              ? "focus-ring min-h-12 w-full bg-surface pl-3 pr-9 text-body font-medium text-foreground shadow-control"
              : "focus-ring h-auto min-h-touch w-auto min-w-max bg-surface pl-2 pr-8 text-xs font-medium text-foreground shadow-control sm:pl-3 sm:pr-8 sm:text-label"
          }
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
