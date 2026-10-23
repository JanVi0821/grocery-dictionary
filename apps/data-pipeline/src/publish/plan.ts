import { ObjectId, type Db } from "mongodb";
import {
  cleanDocument,
  type SourceCompletion,
} from "@grocery/product-model/completion";
import {
  acquireJobLease,
  contentHash,
  jobCollection,
  jobCollectionName,
  readManifest,
  type JobSpec,
  type JobTask,
} from "../jobs/store.ts";

export class PublicationInputError extends Error {}

/** 与旧迁移保持相同 payload；新任务只接受成功数据，失败对象不发布。 */
export function preparePublication(document: SourceCompletion, spec: JobSpec) {
  if (document.needsReview !== false)
    throw new PublicationInputError("Source no longer has needsReview=false");
  try {
    if (spec.stage === "publish:details") {
      return {
        kind: "details" as const,
        row: { id: document.productId, detail: cleanDocument(document) },
      };
    }
    const metadata = document.translation as { status?: unknown } | undefined;
    if (metadata?.status !== "completed")
      throw new Error("Source translation is not completed");
    if (!spec.lang?.trim()) throw new Error("Translation language missing");
    return {
      kind: "translations" as const,
      row: {
        product_id: document.productId,
        lang: spec.lang,
        name: document.product_name as string,
        detail: cleanDocument(document, true),
      },
    };
  } catch (error) {
    throw new PublicationInputError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

/** 以真正写入 PostgreSQL 的 JSON 为版本依据，忽略对象键顺序和被清理的元数据。 */
export function publicationHash(
  publication: ReturnType<typeof preparePublication>,
) {
  return contentHash(JSON.parse(JSON.stringify(publication.row)));
}

export async function planPublicationJob(
  db: Db,
  spec: JobSpec,
  {
    shouldStop = () => false,
    batchSize = 100,
    log = (event: unknown) => console.log(JSON.stringify(event)),
  }: {
    shouldStop?: () => boolean;
    batchSize?: number;
    log?: (event: unknown) => void;
  } = {},
) {
  if (spec.source.database !== db.databaseName)
    throw new Error("Job source database does not match connection");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error("Invalid plan batch size");
  const name = jobCollectionName(spec);
  const collection = jobCollection(db, name);
  await collection.updateOne(
    { _id: "manifest" },
    {
      $setOnInsert: {
        kind: "manifest",
        spec,
        state: "seeding",
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  let manifest = await readManifest(collection);
  if (manifest.state === "ready") {
    log({ event: "publication_plan_reused", job: name });
    return name;
  }
  const lease = await acquireJobLease(collection);
  try {
    // 取得锁后重读，防止另一个初始化实例刚好完成。
    manifest = await readManifest(collection);
    if (manifest.state === "ready") return name;
    await collection.createIndex({ kind: 1, status: 1, productId: 1 });
    await collection.createIndex(
      { productId: 1 },
      { unique: true, partialFilterExpression: { kind: "task" } },
    );
    let afterId = manifest.afterId;
    while (!shouldStop()) {
      await lease.assertActive();
      const conditions = [manifest.spec.filter, { needsReview: false }];
      if (spec.stage === "publish:translations")
        conditions.push({ "translation.status": "completed" });
      if (afterId) conditions.push({ _id: { $gt: afterId } });
      const rows = await db
        .collection<SourceCompletion>(spec.source.collection)
        .find({ $and: conditions })
        .sort({ _id: 1 })
        .limit(batchSize)
        .toArray();
      if (!rows.length) {
        await lease.assertActive();
        const result = await collection.updateOne(
          { _id: "manifest", leaseOwner: lease.owner },
          { $set: { state: "ready", readyAt: new Date() } },
        );
        if (!result.matchedCount)
          throw new Error("Job initialization ownership changed");
        return name;
      }
      const tasks: JobTask[] = rows.map((document) => {
        if (
          !(document._id instanceof ObjectId) ||
          !Number.isSafeInteger(document.productId) ||
          document.productId <= 0
        )
          throw new Error(
            "Publication source requires an ObjectId _id and positive integer productId",
          );
        let inputHash: string | null = null;
        let error: string | undefined;
        try {
          inputHash = publicationHash(preparePublication(document, spec));
        } catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure);
        }
        return {
          _id: document._id.toHexString(),
          kind: "task",
          sourceId: document._id,
          productId: document.productId,
          inputHash,
          status: error ? "blocked" : "pending",
          attempts: 0,
          ...(error ? { lastError: error } : {}),
        };
      });
      await lease.assertActive();
      await collection.bulkWrite(
        tasks.map((task) => ({
          updateOne: {
            filter: { _id: task._id },
            update: { $setOnInsert: task },
            upsert: true,
          },
        })),
      );
      afterId = rows.at(-1)!._id;
      // 整批任务已落库才推进；中断后重放该批也不覆盖任务状态或输入版本。
      await lease.assertActive();
      await collection.updateOne(
        { _id: "manifest", leaseOwner: lease.owner },
        { $set: { afterId } },
      );
      log({
        event: "publication_plan_batch",
        job: name,
        count: tasks.length,
        afterId,
      });
    }
    return name; // 安全退出留下 seeding，下次 plan 同一配置继续初始化。
  } finally {
    await lease.close();
  }
}
