"use client";

import { Link } from "@/i18n/navigation";
import { ScanProductTrigger } from "./_components/ScanProductTrigger";
import Scan from "@/components/icons/scan.svg";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Home");

  return (
    <div className="bg-brand-butter">
      <section
        className="mx-auto flex min-h-home w-full max-w-content flex-col items-center justify-center gap-section px-page-x pb-bottom-nav pt-section lg:pb-section"
        aria-labelledby="home-heading"
      >
        <div className="w-full max-w-reading text-center">
          <h1
            id="home-heading"
            className="text-display font-bold tracking-tight text-foreground"
          >
            {t("heading")}
          </h1>
          <p className="mt-copy-gap text-body font-medium text-foreground-muted">
            {t("description")}
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-page-x">
          <ScanProductTrigger onSuccess={(barcode) => window.alert(barcode)}>
            <div
              className={cn(
                "focus-ring flex w-full max-w-scan-control flex-col items-center justify-center gap-2 rounded-page bg-primary p-page-x text-primary-foreground shadow-raised",
              )}
            >
              <span
                className="relative flex size-scan-mark items-center justify-center"
                aria-hidden="true"
              >
                <Scan
                  className="size-scan-mark stroke-brand-coral"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </span>
              <span className="text-body font-bold">{t("scanProduct")}</span>
            </div>
          </ScanProductTrigger>

          <Link
            href="/barcode"
            className="focus-ring flex min-h-touch w-full max-w-manual-control items-center justify-center rounded-control border border-border bg-surface px-page-x text-label font-semibold text-foreground shadow-control lg:max-w-manual-control-desktop"
          >
            {t("enterBarcode")}
          </Link>
        </div>
      </section>
    </div>
  );
}
