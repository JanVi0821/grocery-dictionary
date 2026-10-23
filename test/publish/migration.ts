import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { readLimit } from "../../packages/pipeline-infra/src/cli.ts";
import { cleanDocument } from "../../packages/product-model/src/completion.ts";
import {
  writeProductsBatch,
  writeTranslationsBatch,
} from "../../packages/pipeline-infra/src/publish.ts";
import {
  FILTER,
  TRANSLATION_FILTER,
} from "../../apps/data-pipeline/src/publish/config.ts";

function mockPool(returnCount: number) {
  const calls: { sql: string; batch?: unknown[] }[] = [];
  let released = false;
  const pool = {
    connect: async () => ({
      query: async (sql: string, values?: string[]) => {
        const batch = values ? JSON.parse(values[0]) : undefined;
        calls.push({ sql, batch });
        return {
          rowCount: returnCount,
          rows:
            batch
              ?.slice(0, returnCount)
              .map((row: { id?: number; product_id?: number }) => ({
                id: row.id ?? row.product_id,
              })) ?? [],
        };
      },
      release: () => {
        released = true;
      },
    }),
  } as unknown as Pick<Pool, "connect">;
  return { pool, calls, released: () => released };
}

test("CLI accepts only a positive execution limit and rejects removed preview arguments", () => {
  assert.equal(readLimit([]), Infinity);
  assert.equal(readLimit(["--limit", "2"]), 2);
  for (const args of [
    ["--dry-run"],
    ["--limit", "0"],
    ["--limit", "bad"],
    ["--limit"],
  ])
    assert.throws(() => readLimit(args));
});

test("both filters are configurable empty objects with no hidden predicates", (t) => {
  for (const filter of [FILTER, TRANSLATION_FILTER]) {
    const original = { ...filter };
    for (const key of Object.keys(filter)) delete filter[key];
    t.after(() => Object.assign(filter, original));
    assert.deepEqual(filter, {});
  }
  const sync = readFileSync(
    new URL(
      "../../apps/data-pipeline/src/publish/bulk-details.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const translation = readFileSync(
    new URL(
      "../../apps/data-pipeline/src/publish/bulk-translations.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sync, /\.find\(FILTER\)/);
  assert.match(translation, /\.find\(TRANSLATION_FILTER\)/);
  assert.doesNotMatch(translation, /const FILTER\s*=/);
});

test("cleaning preserves the current payload and strips redundant metadata", () => {
  const row = {
    productId: 1,
    product_name: "牛奶",
    brand: "Anchor",
    source: "new-world",
    detail: { name: "牛奶" },
    query: "123",
    score: 100,
    attempts: [],
    translation: { status: "completed" },
  };
  assert.deepEqual(cleanDocument(row, true), {
    source: "new-world",
    detail: { name: "牛奶" },
  });
  assert.equal(row.query, "123");
  assert.throws(
    () => cleanDocument({ ...row, detail: "<html>error</html>" }),
    /invalid source or detail/,
  );
  assert.throws(
    () => cleanDocument({ ...row, productId: 0 }),
    /Invalid productId/,
  );
  assert.throws(
    () => cleanDocument({ ...row, product_name: "" }, true),
    /invalid translated name/,
  );
});

test("sync re-executes full detail replacement for existing products", async () => {
  const { pool, calls, released } = mockPool(1);
  for (const detail of [
    { source: "new-world", detail: { name: "old", removed: 1 } },
    { source: "new-world", detail: { name: "new" } },
  ]) {
    assert.equal(await writeProductsBatch(pool, [{ id: 123, detail }]), 1);
  }
  const writes = calls.filter((call) => call.batch);
  assert.equal(writes.length, 2);
  assert.match(writes[1].sql, /set detail = incoming.detail/);
  assert.deepEqual(writes[1].batch, [
    { id: 123, detail: { source: "new-world", detail: { name: "new" } } },
  ]);
  assert.ok(released());
});

test("translations upsert and completely replace both name and detail on reruns", async () => {
  const { pool, calls } = mockPool(1);
  for (const name of ["旧名字", "新名字"]) {
    assert.equal(
      await writeTranslationsBatch(pool, [
        {
          product_id: 123,
          lang: "zh",
          name,
          detail: { source: "new-world", detail: { name } },
        },
      ]),
      1,
    );
  }
  const writes = calls.filter((call) => call.batch);
  assert.equal(writes.length, 2);
  assert.match(writes[1].sql, /on conflict \(product_id, lang\) do update/);
  assert.match(writes[1].sql, /name = excluded.name, detail = excluded.detail/);
  assert.equal((writes[1].batch![0] as { name: string }).name, "新名字");
});

test("missing products or mismatched translation counts roll back and release the connection", async () => {
  for (const translated of [false, true]) {
    const { pool, calls, released } = mockPool(0);
    const promise = translated
      ? writeTranslationsBatch(pool, [
          { product_id: 123, lang: "zh", name: "名字", detail: {} },
        ])
      : writeProductsBatch(pool, [{ id: 123, detail: {} }]);
    await assert.rejects(promise);
    assert.equal(calls.at(-1)!.sql, "rollback");
    assert.ok(!calls.some((call) => call.sql === "commit"));
    assert.ok(released());
  }
});
