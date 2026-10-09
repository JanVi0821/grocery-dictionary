import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { collectionTrail } from "@/lib/collections";
import { CollectionBreadcrumb } from "./_components/CollectionBreadcrumb";
import { CollectionProductList } from "./_components/CollectionProductList";

const COLLECTION_ID_PATTERN = /^[1-9]\d*$/;

const getCollectionPage = cache(
  async (collectionId: number, locale: string) => {
    try {
      return await collectionTrail(collectionId, locale);
    } catch (error) {
      throw new Error("Failed to load collection.", { cause: error });
    }
  },
);

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/explore/[collection]">): Promise<Metadata> {
  const { locale, collection: collectionParam } = await params;

  if (!COLLECTION_ID_PATTERN.test(collectionParam)) notFound();

  const collection = await getCollectionPage(Number(collectionParam), locale);
  if (!collection) notFound();

  return { title: collection.current.name };
}

export default async function CollectionPage({
  params,
}: PageProps<"/[locale]/explore/[collection]">) {
  const { locale, collection: collectionParam } = await params;

  if (!COLLECTION_ID_PATTERN.test(collectionParam)) notFound();

  const collection = await getCollectionPage(Number(collectionParam), locale);
  if (!collection) notFound();

  return (
    <section className="min-h-home bg-background pb-bottom-nav lg:pb-section">
      <div className="mx-auto w-full max-w-content px-page-x py-section">
        <CollectionBreadcrumb items={collection.items} />
        <CollectionProductList
          collectionId={collection.current.id}
          locale={locale}
        />
      </div>
    </section>
  );
}
