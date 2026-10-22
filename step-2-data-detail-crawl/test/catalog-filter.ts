import test from "node:test";
import assert from "node:assert/strict";

test("filtered seed query always requires null detail and nonempty barcodes, ANDed with custom filter", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://catalog-filter.test";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  const queries: URL[] = [];
  globalThis.fetch = async (input) => {
    queries.push(new URL(String(input)));
    return new Response("[]", {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const { filteredProductsPage } = await import("../src/catalog.ts");
    assert.deepEqual(await filteredProductsPage(0, {}), []);
    await filteredProductsPage(100, {
      id: { lte: 500 },
      deleted_from_grocer: { eq: false },
    });
    // 同字段的自定义条件不得替换固定条件；冲突时应无匹配，而非放宽前提。
    await filteredProductsPage(0, {
      detail: { not: "is.null" },
      barcodes: { eq: "{}" },
    });
    for (const { searchParams } of queries) {
      assert.ok(searchParams.getAll("detail").includes("is.null"));
      assert.ok(searchParams.getAll("barcodes").includes("not.eq.{}"));
      assert.equal(searchParams.get("order"), "id.asc");
      assert.equal(searchParams.get("limit"), "100");
    }
    assert.equal(queries.length, 3);
    assert.deepEqual(queries[1].searchParams.getAll("id"), [
      "lte.500",
      "gt.100",
    ]);
    assert.equal(
      queries[1].searchParams.get("deleted_from_grocer"),
      "eq.false",
    );
    assert.deepEqual(queries[2].searchParams.getAll("detail"), [
      "is.null",
      "not.is.null",
    ]);
    assert.deepEqual(queries[2].searchParams.getAll("barcodes"), [
      "not.eq.{}",
      "eq.{}",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
