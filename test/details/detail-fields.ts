import test from "node:test";
import assert from "node:assert/strict";
import {
  removeUnusedDetailFields,
  unusedDetailFieldPaths,
  UNUSED_DETAIL_FIELDS,
  UNUSED_WOOLWORTHS_PRICE_FIELDS,
  unusedRowFieldPaths,
  UNUSED_ROW_FIELDS,
} from "../../apps/data-pipeline/src/details/detail-fields.ts";

test("historical cleanup paths exactly reproduce crawler cleaning without touching retained fields", () => {
  for (const source of ["new-world", "paknsave", "woolworths", "unknown"]) {
    const top =
      source === "woolworths"
        ? UNUSED_DETAIL_FIELDS.woolworths
        : UNUSED_DETAIL_FIELDS.foodstuffs;
    const detail = {
      ...Object.fromEntries(top.map((key) => [key, null])),
      name: "Milk",
      description: "Original",
      price: {
        ...Object.fromEntries(
          UNUSED_WOOLWORTHS_PRICE_FIELDS.map((key) => [key, 123]),
        ),
        retained: 5,
      },
    };
    const actual = structuredClone(detail);
    const paths = unusedDetailFieldPaths(source, detail);
    for (const path of paths) {
      const keys = path.split(".").slice(1);
      const field = keys.pop()!;
      let parent: Record<string, unknown> = actual;
      for (const key of keys) parent = parent[key] as Record<string, unknown>;
      delete parent[field];
    }
    assert.deepEqual(actual, removeUnusedDetailFields(source, detail));
    assert.equal(actual.name, "Milk");
    assert.equal(actual.description, "Original");
    assert.deepEqual(unusedDetailFieldPaths(source, actual), []);
  }
  for (const detail of [null, "<html>error</html>", [], 1])
    assert.deepEqual(unusedDetailFieldPaths("woolworths", detail), []);
  assert.deepEqual(
    unusedDetailFieldPaths("woolworths", { price: "unknown" }),
    [],
  );
});

test("row cleanup removes query and all legacy scores even for null/unknown detail", () => {
  for (const source of ["new-world", "woolworths", "-", "unknown"]) {
    const row = {
      source,
      detail: null,
      ...Object.fromEntries(UNUSED_ROW_FIELDS.map((field) => [field, null])),
    };
    assert.deepEqual(unusedRowFieldPaths(row), [...UNUSED_ROW_FIELDS]);
  }
  assert.deepEqual(
    unusedRowFieldPaths({
      source: "new-world",
      detail: { query: "business", score: 5, price: 3 },
      query: "123",
      productId: 1,
    }),
    ["query", "detail.price"],
  );
  assert.deepEqual(
    unusedRowFieldPaths({
      source: "unknown",
      detail: { query: "business", score: 5 },
    }),
    [],
  );
});
