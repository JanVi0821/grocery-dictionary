import type {
  FoodstuffsProductDetail,
  WoolworthsProductDetail,
  WoolworthsNutritionRow,
} from '../../../fe/src/types/grocer-detail.ts';
import type { SourceDocument, TextPath } from '../types.ts';

const foodstuffsPaths = [
  'name',
  'description',
  'ingredientStatement',
  'fsIngredientStatement',
  'allergenStatement',
  'fsContainsAllergenStatement',
  'fsSupplementaryAllergenStatement',
  'warningCopyDescription',
  'originStatement',
  'categories.*',
  'categoryTrees.*.level0',
  'categoryTrees.*.level1',
  'categoryTrees.*.level2',
  'facets.*.itemDescription',
  'nutritionalInfo.nutrients.*.nutrientTypeDescription',
  'nutritionalInfo.nutrients.*.servingSizeDescription',
] satisfies TextPath<FoodstuffsProductDetail>[];
const woolworthsPaths = [
  'name',
  'genericName',
  'variety',
  'description',
  'directions',
  'servingSuggestion',
  'ingredients.ingredients.*',
  'ingredients.footnotes.*',
  'allergens.*',
  'allergenMaybePresent',
  'warnings.*',
  'origins.*',
  'claims.*',
  'contents.*',
  'endorsements.*',
  'breadcrumb.department.name',
  'breadcrumb.aisle.name',
  'breadcrumb.shelf.name',
  'nutrition.*.columnHeaders.*.name',
  'nutrition.*.servings',
  'nutrition.*.footnotes.*.displayText',
] satisfies TextPath<WoolworthsProductDetail>[];

type Slot = { node: Record<string, unknown>; key: string; path: string; text: string };

function selectSlots(value: unknown, parts: string[], prefix: string, slots: Slot[]): void {
  if (value == null || typeof value !== 'object') return;
  // Dynamic path traversal is confined here; whitelist paths are checked against shared types.
  const node = value as Record<string, unknown>;
  const [key, ...rest] = parts;
  const keys = key === '*' ? (Array.isArray(node) ? node.map((_, i) => String(i)) : []) : [key];
  for (const k of keys) {
    if (!Object.hasOwn(node, k)) continue;
    const path = prefix ? `${prefix}.${k}` : String(k);
    if (rest.length) selectSlots(node[k], rest, path, slots);
    else if (typeof node[k] === 'string' && node[k].trim())
      slots.push({ node, key: k, path, text: node[k] });
  }
}

function nutritionSlots(
  rows: WoolworthsNutritionRow[] | null | undefined,
  prefix: string,
  slots: Slot[],
): void {
  if (!Array.isArray(rows)) return;
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    // The first column is the nutrient label; subsequent columns are measurements.
    selectSlots(row, ['columns', '0'], `${prefix}.${i}`, slots);
    nutritionSlots(row.rows, `${prefix}.${i}.rows`, slots);
  });
}

export function prepareTranslation(row: SourceDocument) {
  const paths =
    row.source === 'woolworths'
      ? woolworthsPaths
      : ['new-world', 'paknsave'].includes(row.source)
        ? foodstuffsPaths
        : null;
  if (!paths) throw new Error(`Unsupported source: ${row.source}`);
  if (
    !row.detail ||
    typeof row.detail !== 'object' ||
    Array.isArray(row.detail) ||
    typeof row.detail.name !== 'string' ||
    !row.detail.name.trim()
  ) {
    throw new Error('Invalid detail: expected product object with nonempty name (not HTML)');
  }
  // Clone only detail; keep BSON identifiers and other source metadata intact.
  const copy = { ...row, detail: structuredClone(row.detail) } as SourceDocument;
  delete copy.attempts;
  const detail = copy.detail;
  const slots: Slot[] = [];
  selectSlots(copy, ['product_name'], 'row', slots);
  for (const path of paths) selectSlots(detail, path.split('.'), '', slots);
  if (
    copy.source === 'woolworths' &&
    typeof copy.detail !== 'string' &&
    Array.isArray(copy.detail.nutrition)
  ) {
    copy.detail.nutrition.forEach((table, i) =>
      nutritionSlots(table?.rows, `nutrition.${i}.rows`, slots),
    );
  }
  return { copy, slots };
}
