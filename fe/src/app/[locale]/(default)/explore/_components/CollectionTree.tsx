import { getLocale, getTranslations } from "next-intl/server";
import { ALL_COLLECTION_ID, collectionTranslationNames } from "@/lib/collections";
import { supabase } from "@/lib/supabase/server";
import type { Tables } from "@/types/generated/database.types";
import { CollectionTreeView } from "./CollectionTreeView";

type CollectionRow = Pick<Tables<"collections">, "id" | "name" | "parent_id">;

type CollectionNode = {
  id: number;
  name: string;
  children: CollectionNode[];
};

function compareCollections(
  left: CollectionNode,
  right: CollectionNode,
  locale: string,
) {
  return left.name.localeCompare(right.name, locale);
}

function sortNodes(items: CollectionNode[], locale: string): CollectionNode[] {
  return items.sort((left, right) => compareCollections(left, right, locale)).map((item) => ({
    ...item,
    children: sortNodes(item.children, locale),
  }));
}

function collapseSameName(node: CollectionNode): CollectionNode {
  const children: CollectionNode[] = [];

  for (const child of node.children) {
    const collapsed = collapseSameName(child);
    if (collapsed.name === node.name) children.push(...collapsed.children);
    else children.push(collapsed);
  }

  return { ...node, children };
}

function collectionForest(rows: CollectionRow[], locale: string) {
  const nodes = new Map<number, CollectionNode>();

  for (const row of rows) {
    nodes.set(row.id, { id: row.id, name: row.name, children: [] });
  }

  const roots: CollectionNode[] = [];

  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;

    const parent = row.parent_id === null ? undefined : nodes.get(row.parent_id);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return sortNodes(roots.map(collapseSameName), locale).flatMap((node) =>
    node.id === ALL_COLLECTION_ID ? node.children : [node],
  );
}

export async function CollectionTree() {
  const t = await getTranslations("Explore");
  const locale = await getLocale();
  let nodes: CollectionNode[] = [];
  let failed = false;

  try {
    const { data, error } = await supabase
      .from("collections")
      .select("id, name, parent_id");

    if (error) throw error;

    const translations = await collectionTranslationNames(locale);
    const rows = (data ?? []).map((row) => ({
      ...row,
      name: translations.get(row.id) || row.name,
    }));
    nodes = collectionForest(rows, locale);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <p className="mt-control-gap text-body text-danger" role="alert">
        {t("loadFailed")}
      </p>
    );
  }

  if (nodes.length === 0) {
    return (
      <p className="mt-control-gap text-body text-foreground-muted">{t("empty")}</p>
    );
  }

  return <CollectionTreeView nodes={nodes} />;
}
