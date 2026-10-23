import { createHash, randomUUID } from "node:crypto";
import {
  BSON,
  type Collection,
  type Db,
  type Document,
  type ObjectId,
  type Filter,
  type UpdateFilter,
} from "mongodb";

export type PublishStage = "publish:details" | "publish:translations";
export type JobSpec = {
  stage: PublishStage;
  source: { endpoint: string; database: string; collection: string };
  target: { endpoint: string; table: "products" | "product_translations" };
  filter: Filter<Document>;
  lang: string | null;
  version: number;
  batch: string;
};
export type Manifest = {
  _id: "manifest";
  kind: "manifest";
  spec: JobSpec;
  state: "seeding" | "ready";
  afterId?: ObjectId;
  createdAt: Date;
  readyAt?: Date;
  leaseOwner?: string;
  leaseUntil?: Date;
};
export type JobTask = {
  _id: string;
  kind: "task";
  sourceId: ObjectId;
  productId: number;
  inputHash: string | null;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
  attempts: number;
  owner?: string;
  lastError?: string;
  finishedAt?: Date;
};
export type JobDocument = Manifest | JobTask;
export type JobCollection = Collection<JobDocument>;
const JOB_NAME = /^pipeline_publish_(details|translations)_[a-f0-9]{64}$/;

/** EJSON 保留 Date/ObjectId 与字符串的类型差异；只排序对象，数组保持原顺序。 */
export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === "object") {
      const row = item as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(row)
          .sort()
          .map((key) => [key, sort(row[key])]),
      );
    }
    return item;
  };
  return JSON.stringify(sort(BSON.EJSON.serialize(value, { relaxed: false })));
}
export const contentHash = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

/** 连接身份不含密码；凭证轮换不重置任务，同一 pooler 上不同项目仍隔离。 */
export function endpointIdentity(raw: string) {
  const url = new URL(raw);
  return contentHash({
    protocol: url.protocol,
    host: url.host,
    user: url.username,
    path: url.pathname.replace(/\/$/, ""),
  });
}

export function jobCollectionName(spec: JobSpec) {
  if (
    !["publish:details", "publish:translations"].includes(spec.stage) ||
    !spec.batch.trim() ||
    !Number.isSafeInteger(spec.version) ||
    spec.version < 1
  )
    throw new Error("Invalid publication job specification");
  return `pipeline_${spec.stage.replace(":", "_")}_${contentHash(spec)}`;
}

export function jobCollection(db: Db, name: string) {
  if (!JOB_NAME.test(name))
    throw new Error("Invalid publication job collection name");
  return db.collection<JobDocument>(name);
}

export async function readManifest(collection: JobCollection) {
  const manifest = await collection.findOne({
    _id: "manifest",
    kind: "manifest",
  });
  if (!manifest || manifest.kind !== "manifest")
    throw new Error(`Job not found: ${collection.collectionName}`);
  if (jobCollectionName(manifest.spec) !== collection.collectionName)
    throw new Error("Stored job specification does not match its identity");
  return manifest;
}

export class JobLeaseLostError extends Error {}

/** 单任务集单消费者；跨 MongoDB/PostgreSQL 为至少一次提交，由幂等目标写入恢复。 */
export async function acquireJobLease(collection: JobCollection) {
  const owner = randomUUID();
  const ttl = 120000;
  const now = new Date();
  const acquired = await collection.findOneAndUpdate(
    {
      _id: "manifest",
      kind: "manifest",
      $or: [{ leaseOwner: { $exists: false } }, { leaseUntil: { $lte: now } }],
    },
    { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + ttl) } },
    { returnDocument: "after", includeResultMetadata: false },
  );
  if (!acquired)
    throw new Error(
      "Job is busy; wait for its running process or lease expiry",
    );
  let lost: unknown;
  let heartbeat = Promise.resolve();
  const timer = setInterval(() => {
    heartbeat = heartbeat
      .then(async () => {
        if (lost) return;
        const renewed = await collection.updateOne(
          {
            _id: "manifest",
            leaseOwner: owner,
            leaseUntil: { $gt: new Date() },
          },
          { $set: { leaseUntil: new Date(Date.now() + ttl) } },
        );
        if (!renewed.matchedCount)
          throw new JobLeaseLostError("Job lease lost");
      })
      .catch((error) => {
        lost = error;
      });
  }, ttl / 3);
  timer.unref();
  return {
    owner,
    async assertActive() {
      if (lost)
        throw new JobLeaseLostError("Job heartbeat failed", { cause: lost });
      if (
        !(await collection.findOne(
          {
            _id: "manifest",
            leaseOwner: owner,
            leaseUntil: { $gt: new Date() },
          },
          { projection: { _id: 1 } },
        ))
      )
        throw new JobLeaseLostError("Job lease lost");
    },
    async close() {
      clearInterval(timer);
      await heartbeat;
      await collection.updateOne(
        { _id: "manifest", leaseOwner: owner },
        { $unset: { leaseOwner: "", leaseUntil: "" } },
      );
    },
  };
}
export type JobLease = Awaited<ReturnType<typeof acquireJobLease>>;

export async function claimTask(
  collection: JobCollection,
  lease: JobLease,
): Promise<JobTask | null> {
  await lease.assertActive();
  const row = await collection.findOneAndUpdate(
    { kind: "task", status: "pending" },
    { $set: { status: "running", owner: lease.owner }, $inc: { attempts: 1 } },
    {
      sort: { productId: 1 },
      returnDocument: "after",
      includeResultMetadata: false,
    },
  );
  return row?.kind === "task" ? row : null;
}

export async function finishTask(
  collection: JobCollection,
  lease: JobLease,
  task: JobTask,
  status: "succeeded" | "failed" | "blocked",
  error?: string,
) {
  await lease.assertActive();
  const update: UpdateFilter<JobDocument> =
    status === "succeeded"
      ? {
          $set: { status, finishedAt: new Date() },
          $unset: { owner: "", lastError: "" },
        }
      : {
          $set: { status, finishedAt: new Date(), lastError: error ?? status },
          $unset: { owner: "" },
        };
  const result = await collection.updateOne(
    { _id: task._id, kind: "task", status: "running", owner: lease.owner },
    update,
  );
  if (result.matchedCount !== 1)
    throw new JobLeaseLostError(
      "Task ownership changed; result acknowledgement refused",
    );
}

export async function jobStatus(collection: JobCollection) {
  const manifest = await readManifest(collection);
  const counts = {
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
  };
  const rows = await collection
    .aggregate<{ _id: keyof typeof counts; count: number }>([
      { $match: { kind: "task" } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) counts[row._id] = row.count;
  return {
    job: collection.collectionName,
    state: manifest.state,
    stage: manifest.spec.stage,
    sourceCollection: manifest.spec.source.collection,
    targetTable: manifest.spec.target.table,
    lang: manifest.spec.lang,
    version: manifest.spec.version,
    batch: manifest.spec.batch,
    filter: manifest.spec.filter,
    counts,
  };
}

/** 只重新开放执行失败项；blocked 表示输入失效/非法，应修正后显式新建批次。 */
export async function retryFailedTasks(collection: JobCollection) {
  const manifest = await readManifest(collection);
  if (manifest.state !== "ready")
    throw new Error("Finish initializing this job before retrying");
  const lease = await acquireJobLease(collection);
  try {
    await lease.assertActive();
    return (
      await collection.updateMany(
        { kind: "task", status: "failed" },
        { $set: { status: "pending" }, $unset: { finishedAt: "" } },
      )
    ).modifiedCount;
  } finally {
    await lease.close();
  }
}
