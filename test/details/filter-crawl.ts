import test from "node:test";
import assert from "node:assert/strict";
import type { Collection, Document } from "mongodb";
import {
  filterCollectionIdentity,
  seedFilterCollection,
  nextFilterTask,
  completeFilterTask,
  type FilterTaskDocument,
} from "../../apps/data-pipeline/src/details/filter-crawl-collection.ts";
import { createFilteredTask, createTask } from "../../apps/data-pipeline/src/details/crawlers/tasks.ts";

function memoryCollection() {
  const rows = new Map<string | number, Document>();
  let interruptCheckpoint = false;
  const matches = (row: Document, filter: Document) =>
    Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === "object") {
        if ("$in" in value) return value.$in.includes(row[key]);
        if ("$ne" in value) return row[key] !== value.$ne;
      }
      return row[key] === value;
    });
  const api = {
    collectionName: "test_filter",
    findOne: async (filter: Document, options?: Document) => {
      let candidates = [...rows.values()].filter((row) => matches(row, filter));
      if (options?.sort) candidates = candidates.sort((a, b) => a._id - b._id);
      return structuredClone(candidates[0] ?? null);
    },
    updateOne: async (
      filter: Document,
      update: Document,
      options?: Document,
    ) => {
      if (interruptCheckpoint && update.$set?.seedAfterId) {
        interruptCheckpoint = false;
        throw new Error("interrupted before seed checkpoint");
      }
      let row = [...rows.values()].find((row) => matches(row, filter));
      if (!row && options?.upsert) {
        const inserted = { _id: filter._id, ...update.$setOnInsert };
        rows.set(inserted._id, inserted);
        row = inserted;
      }
      if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {})) delete row[key];
      return { matchedCount: 1 };
    },
    bulkWrite: async (operations: Document[]) => {
      for (const { updateOne } of operations)
        await api.updateOne(updateOne.filter, updateOne.update, {
          upsert: updateOne.upsert,
        });
    },
    createIndex: async () => "task_status",
  };
  return {
    rows,
    collection: api as unknown as Collection<FilterTaskDocument>,
    interruptNextCheckpoint: () => {
      interruptCheckpoint = true;
    },
  };
}
const product = (id: number) => ({
  id,
  name: `Product ${id}`,
  brand: null,
  barcodes: [String(id)],
});

test("collection hash uses only normalized filter JSON and rejects invalid values", () => {
  const a = { deleted_from_grocer: { eq: false }, id: { gte: 1, lt: 10 } };
  const b = { id: { lt: 10, gte: 1 }, deleted_from_grocer: { eq: false } };
  assert.equal(
    filterCollectionIdentity(a).collectionName,
    filterCollectionIdentity(b).collectionName,
  );
  assert.match(
    filterCollectionIdentity(a).collectionName,
    /^data_completion_filter_[a-f0-9]{64}$/,
  );
  assert.notEqual(
    filterCollectionIdentity(a).collectionName,
    filterCollectionIdentity({}).collectionName,
  );
  assert.notEqual(
    filterCollectionIdentity({ id: { eq: 1 } }).collectionName,
    filterCollectionIdentity({ id: { eq: 2 } }).collectionName,
  );
  assert.throws(() => filterCollectionIdentity({ id: { eq: NaN } }));
});

test("seed all pages before ready, then reuse snapshot without querying Supabase again", async () => {
  const { collection, rows } = memoryCollection();
  const filter = { id: { gt: 0 } };
  const calls: number[] = [];
  await seedFilterCollection(
    collection,
    filter,
    async (afterId, actualFilter) => {
      assert.deepEqual(actualFilter, filter);
      assert.equal(rows.get("manifest")?.status, "seeding");
      calls.push(afterId);
      return afterId === 0
        ? [product(1), product(3)]
        : afterId === 3
          ? [product(8)]
          : [];
    },
  );
  assert.deepEqual(calls, [0, 3, 8]);
  assert.equal(rows.size, 4);
  assert.equal(rows.get("manifest")?.status, "ready");
  assert.deepEqual(rows.get(1)?.product, product(1));
  await seedFilterCollection(collection, filter, async () => {
    throw new Error("must not fetch existing snapshot");
  });
  assert.equal(rows.size, 4);
});

test("interrupted seeding replays persisted batch without duplicate rows or resetting task markers", async () => {
  const { collection, rows, interruptNextCheckpoint } = memoryCollection();
  const fetchPage = async (afterId: number) =>
    afterId === 0 ? [product(2), product(7)] : [];
  interruptNextCheckpoint();
  await assert.rejects(
    seedFilterCollection(collection, {}, fetchPage),
    /interrupted/,
  );
  assert.equal(rows.get("manifest")?.status, "seeding");
  assert.equal(rows.get("manifest")?.seedAfterId, 0);
  assert.equal(rows.size, 3);
  await seedFilterCollection(collection, {}, fetchPage);
  assert.equal(rows.size, 3);
  assert.equal(rows.get("manifest")?.status, "ready");
  assert.equal((await nextFilterTask(collection))?._id, 2);
});

test("resume uses task status, including failed rows; destination must save before completed marker", async () => {
  const { collection, rows } = memoryCollection();
  await seedFilterCollection(collection, {}, async (afterId) =>
    afterId ? [] : [product(1), product(2), product(3)],
  );
  await assert.rejects(
    completeFilterTask(collection, 1, false, async () => {
      throw new Error("save failed");
    }),
    /save failed/,
  );
  assert.equal(rows.get(1)?.status, "pending");
  await completeFilterTask(collection, 1, true, async () => {
    assert.equal(rows.get(1)?.status, "pending");
  });
  assert.equal(rows.get(1)?.status, "completed");
  assert.equal(rows.get(1)?.needsReview, true); // 无匹配也是一次已完成的抓取。
  await collection.updateOne(
    { _id: 2 },
    { $set: { status: "failed", lastError: "timeout" } },
  );
  assert.equal((await nextFilterTask(collection))?._id, 2);
  await completeFilterTask(collection, 2, false, async () => {});
  assert.equal(rows.get(2)?.lastError, undefined);
  assert.equal((await nextFilterTask(collection))?._id, 3);
  await completeFilterTask(collection, 3, false, async () => {});
  assert.equal(await nextFilterTask(collection), null);
});

test("filtered requests carry collection and product ID, not a separate progress cursor", () => {
  const task = createFilteredTask("collection-hash", 123, 10, 20);
  assert.notEqual(task.label, createTask(123, 10, 20).label);
  assert.deepEqual(task.userData, {
    collectionName: "collection-hash",
    productId: 123,
    remaining: 10,
    limit: 20,
  });
  assert.equal(task.uniqueKey, "filtered:collection-hash:123:10");
});
