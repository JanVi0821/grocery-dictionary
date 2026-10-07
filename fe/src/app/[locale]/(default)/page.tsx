import { BarcodeEntryForm } from "./_components/BarcodeEntryForm";
import { ScanProductTrigger } from "./_components/ScanProductTrigger";
import { SupportedRetailers } from "./_components/SupportedRetailers";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ScanningSvg from "@/components/icons/Scanning.svg";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });

  return {
    title: t("heading"),
    description: t("description"),
    openGraph: {
      title: t("heading"),
      description: t("description"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("heading"),
      description: t("description"),
    },
  };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });

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
          <SupportedRetailers />
        </div>

        <div className="flex w-full flex-col items-center gap-10">
          <ScanProductTrigger>
            <div
              className={cn(
                "focus-ring flex w-full max-w-scan-control flex-col items-center justify-center gap-4 rounded-page bg-primary p-page-x text-primary-foreground shadow-raised",
              )}
            >
              <span
                className="relative flex size-scan-mark items-center justify-center"
                aria-hidden="true"
              >
                <ScanningSvg
                  className="size-scan-mark stroke-brand-coral"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </span>
              <span className="text-body font-bold">{t("scanProduct")}</span>
            </div>
          </ScanProductTrigger>

          <BarcodeEntryForm />
        </div>
      </section>
    </div>
  );
}
