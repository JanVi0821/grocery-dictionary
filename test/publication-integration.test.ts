import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { planPublicationJob } from "../apps/data-pipeline/src/publish/plan.ts";
import { runPublicationJob } from "../apps/data-pipeline/src/publish/run.ts";
import {
  acquireJobLease,
  jobCollection,
  jobCollectionName,
  jobStatus,
  readManifest,
  retryFailedTasks,
  type JobSpec,
} from "../apps/data-pipeline/src/jobs/store.ts";

/** 显式指定测试 URI 才连接；只写随机隔离库，不访问现有业务表，不连接 PostgreSQL。 */
test(
  "real MongoDB: durable publication state, lease exclusion and unique product mapping",
  {
    skip: !process.env.PIPELINE_TEST_MONGO_URI,
  },
  async () => {
    const uri = new URL(process.env.PIPELINE_TEST_MONGO_URI!);
    uri.pathname = "/";
    const client = new MongoClient(uri.toString(), {
      serverSelectionTimeoutMS: 10000,
    });
    const databaseName = `pipeline_test_${randomUUID().replaceAll("-", "")}`;
    const db = client.db(databaseName);
    try {
      await client.connect();
      const source = db.collection("source");
      const documents = [1, 2, 3].map((id) => ({
        _id: new ObjectId(),
        productId: id,
        source: "new-world",
        needsReview: false,
        product_name: `Milk ${id}`,
        detail: { name: `Milk ${id}` },
      }));
      await source.insertMany(documents);
      const spec: JobSpec = {
        stage: "publish:details",
        source: {
          endpoint: "isolated-test",
          database: databaseName,
          collection: "source",
        },
        target: { endpoint: "fake-target-no-postgres", table: "products" },
        filter: {},
        lang: null,
        version: 1,
        batch: "test",
      };
      const silent = { log: (_event: unknown) => {} };
      const name = await planPublicationJob(db, spec, silent);
      const jobs = jobCollection(db, name);
      const first = await acquireJobLease(jobs);
      try {
        await assert.rejects(acquireJobLease(jobs), /busy/);
      } finally {
        await first.close();
      }
      const target = new Map<number, unknown>();
      const options = {
        ...silent,
        verifyTarget: () => {},
        publish: async (publication: { kind: string; row: unknown }) => {
          const row = publication.row as { id: number };
          target.set(row.id, publication.row);
        },
      };
      assert.equal(
        (await runPublicationJob(db, name, { ...options, limit: 1 })).written,
        1,
      );
      await source.updateOne(
        { productId: 2 },
        { $set: { "detail.name": "changed after planning" } },
      );
      const result = await runPublicationJob(db, name, {
        ...options,
        publish: async (publication) => {
          if (publication.kind === "details" && publication.row.id === 3)
            throw new Error("temporary row failure");
        },
      });
      assert.equal(result.blocked, 1);
      assert.equal(result.failed, 1);
      assert.equal(await retryFailedTasks(jobs), 1);
      assert.equal((await runPublicationJob(db, name, options)).written, 1);
      assert.deepEqual((await jobStatus(jobs)).counts, {
        pending: 0,
        running: 0,
        succeeded: 2,
        failed: 0,
        blocked: 1,
      });
      assert.deepEqual([...target.keys()], [1, 3]);
      await source.insertOne({
        _id: new ObjectId(),
        productId: 4,
        source: "new-world",
        needsReview: false,
        product_name: "Milk 4",
        detail: { name: "Milk 4" },
      });
      assert.equal(await planPublicationJob(db, spec, silent), name);
      assert.equal(await jobs.countDocuments({ kind: "task" }), 3);

      // 唯一索引阻止同 productId 的两条源数据产生不确定的覆盖顺序。
      await db
        .collection("duplicate_source")
        .insertMany(
          [5, 5].map((productId) => ({
            productId,
            source: "new-world",
            needsReview: false,
            detail: { name: "duplicate" },
          })),
        );
      const duplicate = {
        ...spec,
        source: { ...spec.source, collection: "duplicate_source" },
      };
      await assert.rejects(
        planPublicationJob(db, duplicate, silent),
        /duplicate key|E11000/,
      );
      assert.equal(
        (await readManifest(jobCollection(db, jobCollectionName(duplicate))))
          .state,
        "seeding",
      );
    } finally {
      try {
        if (
          !/^pipeline_test_[a-f0-9]{32}$/.test(db.databaseName) ||
          db.databaseName !== databaseName
        )
          throw new Error("Refusing cleanup outside isolated test database");
        await db.dropDatabase();
      } finally {
        await client.close();
      }
    }
  },
);
