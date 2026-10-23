import "server-only";
import { routing } from "@/i18n/routing";
import { supabase } from "@/lib/supabase/server";

export const ALL_COLLECTION_ID = 1;

export async function collectionTranslationNames(locale: string) {
  const names = new Map<number, string>();
  if (locale === routing.defaultLocale) return names;

  const { data, error } = await supabase
    .from("collection_translations")
    .select("collection_id, name")
    .eq("language_code", locale);

  if (error) throw error;

  for (const row of data ?? []) names.set(row.collection_id, row.name);
  return names;
}

const collectionChainSelect = `
  id,
  name,
  collection_translations (language_code, name),
  parent:parent_id (
    id,
    name,
    collection_translations (language_code, name),
    parent:parent_id (
      id,
      name,
      collection_translations (language_code, name),
      parent:parent_id (
        id,
        name,
        collection_translations (language_code, name)
      )
    )
  )
`;

type CollectionChainRow = {
  id: number;
  name: string;
  collection_translations: { language_code: string; name: string }[] | null;
  parent: CollectionChainRow | CollectionChainRow[] | null;
};

function collectionName(row: CollectionChainRow, locale: string) {
  if (locale === routing.defaultLocale) return row.name;

  const translated = row.collection_translations?.find(
    (item) => item.language_code === locale,
  );
  return translated?.name || row.name;
}

function chainParent(parent: CollectionChainRow["parent"]) {
  if (!parent) return null;
  return Array.isArray(parent) ? (parent[0] ?? null) : parent;
}

export async function collectionTrail(collectionId: number, locale: string) {
  const { data, error } = await supabase
    .from("collections")
    .select(collectionChainSelect)
    .eq("id", collectionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const items: { id: number; name: string }[] = [];
  const seen = new Set<number>();
  let row: CollectionChainRow | null = data as unknown as CollectionChainRow;

  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    items.unshift({
      id: row.id,
      name: collectionName(row, locale),
    });
    row = chainParent(row.parent);
  }

  const visible = items.filter((item) => item.id !== ALL_COLLECTION_ID);
  const current = visible.find((item) => item.id === collectionId);
  if (!current) return null;

  return { current, items: visible };
}
