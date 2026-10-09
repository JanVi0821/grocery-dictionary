import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CollectionTree } from "./_components/CollectionTree";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/explore">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Explore" });

  return {
    title: t("title"),
  };
}

export default async function ExplorePage() {
  const t = await getTranslations("Explore");

  return (
    <section className="min-h-home bg-background pb-bottom-nav lg:pb-section">
      <div className="mx-auto w-full max-w-content px-page-x py-section">
        <h1 className="text-heading font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <CollectionTree />
      </div>
    </section>
  );
}
