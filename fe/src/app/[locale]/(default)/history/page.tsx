import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HistoryList } from "./_components/HistoryList";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/history">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "History" });

  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function HistoryPage({
  params,
}: PageProps<"/[locale]/history">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "History" });

  return (
    <section className="min-h-home bg-background pb-bottom-nav lg:pb-section">
      <div className="mx-auto w-full max-w-content px-page-x py-section">
        <p className="mb-control-gap text-label text-foreground-muted">
          {t("retentionDescription")}
        </p>
        <HistoryList locale={locale} />
      </div>
    </section>
  );
}
