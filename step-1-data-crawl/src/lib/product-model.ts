export interface HierarchyEdge {
  parent_id: number;
  child_id: number;
}

export function cleanOptionalText(value: unknown): string | null {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || null;
}

export function buildParentMap(
  rows: readonly HierarchyEdge[],
): Map<number, Set<number>> {
  const parentsByChild = new Map<number, Set<number>>();
  for (const { parent_id: parentId, child_id: childId } of rows) {
    const parents = parentsByChild.get(childId) ?? new Set<number>();
    parents.add(parentId);
    parentsByChild.set(childId, parents);
  }
  return parentsByChild;
}

export function expandCollectionIds(
  directIds: readonly number[],
  parentsByChild: ReadonlyMap<number, ReadonlySet<number>>,
): number[] {
  const visited = new Set<number>();
  const pending = [...directIds];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    for (const parentId of parentsByChild.get(id) ?? []) pending.push(parentId);
  }
  visited.delete(1);
  return [...visited].sort((left, right) => left - right);
}

export function addToMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}
