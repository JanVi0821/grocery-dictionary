import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { memoryDatabase } from "./fixtures/memory-mongo.ts";
import {
  acquireJobLease,
  claimTask,
  finishTask,
  jobCollection,
  jobCollectionName,
  jobStatus,
  readManifest,
  retryFailedTasks,
  contentHash,
  endpointIdentity,
  type JobSpec,
} from "../apps/data-pipeline/src/jobs/store.ts";
import {
  planPublicationJob,
  preparePublication,
  publicationHash,
} from "../apps/data-pipeline/src/publish/plan.ts";
import { runPublicationJob } from "../apps/data-pipeline/src/publish/run.ts";
import { MissingProductMappingError } from "../packages/pipeline-infra/src/publish.ts";

const spec = (batch = "default"): JobSpec => ({
  stage: "publish:details",
  source: { endpoint: "mongo", database: "test", collection: "source" },
  target: { endpoint: "pg", table: "products" },
  filter: {},
  lang: null,
  version: 1,
  batch,
});
const row = (id: number) => ({
  _id: new ObjectId(id.toString(16).padStart(24, "0")),
  productId: id,
  source: "new-world",
  needsReview: false,
  product_name: `Milk ${id}`,
  detail: { name: `Milk ${id}` },
});
const silent = { log: (_event: unknown) => {} };
const setup = (...ids: number[]) => {
  const state = memoryDatabase();
  for (const id of ids)
    state.collection("source").rows.set(String(row(id)._id), row(id));
  return state;
};

test("job identity canonicalizes filters and distinguishes date types, stages, languages, versions, batches and projects", () => {
  const a = spec();
  a.filter = {
    at: { $gte: new Date("2026-10-20T00:00:00Z") },
    needsReview: false,
  };
  const b = {
    ...a,
    filter: {
      needsReview: false,
      at: { $gte: new Date("2026-10-20T00:00:00Z") },
    },
  };
  assert.equal(jobCollectionName(a), jobCollectionName(b));
  for (const changed of [
    {
      ...a,
      filter: { at: { $gte: "2026-10-20T00:00:00.000Z" }, needsReview: false },
    },
    { ...a, version: 2 },
    { ...a, batch: "new" },
    { ...a, lang: "ja" },
    { ...a, target: { ...a.target, endpoint: "other" } },
    { ...a, stage: "publish:translations" as const },
  ])
    assert.notEqual(jobCollectionName(a), jobCollectionName(changed));
  assert.notEqual(contentHash([1, 2]), contentHash([2, 1]));
  assert.equal(
    endpointIdentity("postgresql://user:old@host/db"),
    endpointIdentity("postgresql://user:new@host/db"),
  );
  assert.notEqual(
    endpointIdentity("postgresql://postgres.a:key@host/db"),
    endpointIdentity("postgresql://postgres.b:key@host/db"),
  );
});

test("plan imports all eligible tasks; fixed snapshot reuse does not re-query source; invalid rows are blocked", async () => {
  const { db, collection } = setup(1, 2, 3);
  collection("source").rows.get(String(row(2)._id))!.detail =
    "<html>error</html>";
  collection("source").rows.get(String(row(3)._id))!.needsReview = true;
  const name = await planPublicationJob(db, spec(), silent);
  assert.deepEqual((await jobStatus(jobCollection(db, name))).counts, {
    pending: 1,
    running: 0,
    succeeded: 0,
    failed: 0,
    blocked: 1,
  });
  assert.equal(
    collection(name).rows.get(String(row(2)._id))?.lastError,
    "Product 2 has an invalid source or detail object",
  );
  collection("source").fault = () => {
    throw new Error("ready snapshot must not re-read source");
  };
  assert.equal(await planPublicationJob(db, spec(), silent), name);
});

test("seeding interrupted after batch persistence resumes idempotently before execution", async () => {
  const { db, collection } = setup(
    ...Array.from({ length: 101 }, (_, i) => i + 1),
  );
  const name = jobCollectionName(spec());
  let interrupt = true;
  collection(name).fault = (operation, _filter, update) => {
    if (interrupt && operation === "updateOne" && update?.$set?.afterId) {
      interrupt = false;
      throw new Error("crash before cursor");
    }
  };
  await assert.rejects(
    planPublicationJob(db, spec(), silent),
    /crash before cursor/,
  );
  assert.equal(collection(name).rows.size, 101); // manifest + 100 tasks
  await assert.rejects(
    runPublicationJob(db, name, {
      ...silent,
      verifyTarget: () => {},
      publish: async () => {
        throw new Error("must not publish");
      },
    }),
    /still seeding/,
  );
  await planPublicationJob(db, spec(), silent);
  assert.equal(collection(name).rows.size, 102);
  assert.equal((await readManifest(jobCollection(db, name))).state, "ready");
});

test("limited reruns continue pending items without max-ID gaps or rewriting successes", async () => {
  const { db } = setup(1, 2, 3);
  const name = await planPublicationJob(db, spec(), silent);
  const written: number[] = [];
  const options = {
    ...silent,
    verifyTarget: () => {},
    limit: 1,
    publish: async (p: ReturnType<typeof preparePublication>) => {
      written.push(p.kind === "details" ? p.row.id : p.row.product_id);
    },
  };
  for (let i = 0; i < 4; i++) await runPublicationJob(db, name, options);
  assert.deepEqual(written, [1, 2, 3]);
  assert.equal((await jobStatus(jobCollection(db, name))).counts.succeeded, 3);
});

test("failure does not block later valid records and explicit retry reopens only failures", async () => {
  const { db } = setup(1, 2);
  const name = await planPublicationJob(db, spec(), silent);
  const first = await runPublicationJob(db, name, {
    ...silent,
    verifyTarget: () => {},
    publish: async (p) => {
      if (p.kind === "details" && p.row.id === 1)
        throw new Error("missing product");
    },
  });
  assert.deepEqual(first, { processed: 2, written: 1, failed: 1, blocked: 0 });
  assert.equal(await retryFailedTasks(jobCollection(db, name)), 1);
  const written: number[] = [];
  await runPublicationJob(db, name, {
    ...silent,
    verifyTarget: () => {},
    publish: async (p) => {
      written.push(p.kind === "details" ? p.row.id : p.row.product_id);
    },
  });
  assert.deepEqual(written, [1]);
});

test("crash after target write but before acknowledgement replays safely; success marker is never written early", async () => {
  const { db, collection } = setup(1);
  const name = await planPublicationJob(db, spec(), silent);
  let crash = true,
    publishes = 0;
  collection(name).fault = (operation, _filter, update) => {
    if (
      crash &&
      operation === "updateOne" &&
      update?.$set?.status === "succeeded"
    ) {
      crash = false;
      throw new Error("ack crash");
    }
  };
  const publish = async () => {
    publishes++;
    assert.equal(
      collection(name).rows.get(String(row(1)._id))?.status,
      "running",
    );
  };
  await assert.rejects(
    runPublicationJob(db, name, { ...silent, verifyTarget: () => {}, publish }),
    /ack crash/,
  );
  assert.equal((await jobStatus(jobCollection(db, name))).counts.running, 1);
  await runPublicationJob(db, name, {
    ...silent,
    verifyTarget: () => {},
    publish,
  });
  assert.equal(publishes, 2); // 幂等目标写入允许至少一次重放，而非假称跨库 exactly-once。
  assert.equal((await jobStatus(jobCollection(db, name))).counts.succeeded, 1);
});

test("a missing products.id records failure and stops, preserving the earlier mapping contract", async () => {
  const { db } = setup(1, 2);
  const name = await planPublicationJob(db, spec(), silent);
  let calls = 0;
  await assert.rejects(
    runPublicationJob(db, name, {
      ...silent,
      verifyTarget: () => {},
      publish: async () => {
        calls++;
        throw new MissingProductMappingError(
          "No products.id match for productId(s): 1",
        );
      },
    }),
    /No products.id match/,
  );
  assert.equal(calls, 1);
  assert.deepEqual((await jobStatus(jobCollection(db, name))).counts, {
    pending: 1,
    running: 0,
    succeeded: 0,
    failed: 1,
    blocked: 0,
  });
});

test("source changes block the old snapshot; a new batch uses the changed input", async () => {
  const { db, collection } = setup(1);
  const name = await planPublicationJob(db, spec(), silent);
  collection("source").rows.get(String(row(1)._id))!.detail.name =
    "Updated milk";
  let calls = 0;
  const options = {
    ...silent,
    verifyTarget: () => {},
    publish: async () => {
      calls++;
    },
  };
  assert.equal((await runPublicationJob(db, name, options)).blocked, 1);
  assert.equal(calls, 0);
  assert.equal(await retryFailedTasks(jobCollection(db, name)), 0);
  const next = await planPublicationJob(db, spec("updated-input"), silent);
  assert.notEqual(next, name);
  await runPublicationJob(db, next, options);
  assert.equal(calls, 1);
});

test("lease exclusion and ownership fencing prevent an old worker from acknowledging another run", async () => {
  const { db, collection } = setup(1);
  const name = await planPublicationJob(db, spec(), silent);
  const jobs = jobCollection(db, name);
  const first = await acquireJobLease(jobs);
  const task = (await claimTask(jobs, first))!;
  await assert.rejects(acquireJobLease(jobs), /busy/);
  collection(name).rows.get("manifest")!.leaseUntil = new Date(0);
  const second = await acquireJobLease(jobs);
  try {
    await assert.rejects(
      finishTask(jobs, first, task, "succeeded"),
      /lease lost/,
    );
    await first.close();
    await second.assertActive();
  } finally {
    await first.close();
    await second.close();
  }
});

test("graceful stop finishes current publication; global connection errors leave work recoverable", async () => {
  const { db } = setup(1, 2);
  const name = await planPublicationJob(db, spec(), silent);
  let stopping = false;
  const counts = await runPublicationJob(db, name, {
    ...silent,
    verifyTarget: () => {},
    shouldStop: () => stopping,
    publish: async () => {
      stopping = true;
    },
  });
  assert.equal(counts.written, 1);
  await assert.rejects(
    runPublicationJob(db, name, {
      ...silent,
      verifyTarget: () => {},
      publish: async () => {
        throw Object.assign(new Error("connection lost"), {
          code: "ECONNREFUSED",
        });
      },
    }),
    /connection lost/,
  );
  assert.equal((await jobStatus(jobCollection(db, name))).counts.running, 1);
  await runPublicationJob(db, name, {
    ...silent,
    verifyTarget: () => {},
    publish: async () => {},
  });
  assert.equal((await jobStatus(jobCollection(db, name))).counts.succeeded, 2);
});

test("translation plans exclude failures and preserve the existing name/detail conversion", async () => {
  const { db, collection } = setup(1, 2);
  collection("source").rows.get(String(row(1)._id))!.translation = {
    status: "completed",
  };
  collection("source").rows.get(String(row(2)._id))!.translation = {
    status: "failed",
  };
  const translated: JobSpec = {
    ...spec(),
    stage: "publish:translations",
    target: { endpoint: "pg", table: "product_translations" },
    lang: "zh",
  };
  const name = await planPublicationJob(db, translated, silent);
  assert.equal((await jobStatus(jobCollection(db, name))).counts.pending, 1);
  const prepared = preparePublication(
    { ...row(1), translation: { status: "completed" } },
    translated,
  );
  assert.deepEqual(prepared, {
    kind: "translations",
    row: {
      product_id: 1,
      lang: "zh",
      name: "Milk 1",
      detail: { source: "new-world", detail: { name: "Milk 1" } },
    },
  });
  assert.equal(
    publicationHash(preparePublication({ ...row(1), at: new Date() }, spec())),
    publicationHash(preparePublication(row(1), spec())),
  );
});
