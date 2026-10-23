import { MongoError, type Db } from "mongodb";
import type { Pool } from "pg";
import type { SourceCompletion } from "@grocery/product-model/completion";
import {
  writeProductsBatch,
  writeTranslationsBatch,
  MissingProductMappingError,
} from "@grocery/pipeline-infra/publish";
import {
  acquireJobLease,
  claimTask,
  finishTask,
  jobCollection,
  readManifest,
  JobLeaseLostError,
  type JobSpec,
} from "../jobs/store.ts";
import {
  preparePublication,
  publicationHash,
  PublicationInputError,
} from "./plan.ts";

type Publication = ReturnType<typeof preparePublication>;

/** ponytail: 首版逐商品事务便于隔离错误；发布吞吐成为瓶颈时增加批提交，不牺牲逐条任务状态。 */
export async function writePublication(
  pool: Pick<Pool, "connect">,
  publication: Publication,
) {
  if (publication.kind === "details")
    await writeProductsBatch(pool, [publication.row]);
  else await writeTranslationsBatch(pool, [publication.row]);
}

function fatal(error: unknown) {
  if (error instanceof JobLeaseLostError || error instanceof MongoError)
    return true;
  const code = String((error as { code?: unknown })?.code ?? "");
  return (
    /^(08|28|53|57P|42)/.test(code) ||
    [
      "57014",
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EHOSTUNREACH",
    ].includes(code) ||
    (error instanceof Error &&
      /connection (terminated|closed|timeout|error)|timeout exceeded when trying to connect|not queryable|pool after calling end/i.test(
        error.message,
      ))
  );
}

/** 每次运行只领取 pending；失败留给显式 retry，避免同一轮无限重试同一商品。 */
export async function runPublicationJob(
  db: Db,
  name: string,
  {
    publish,
    verifyTarget,
    limit = Infinity,
    shouldStop = () => false,
    log = (event: unknown) => console.log(JSON.stringify(event)),
  }: {
    publish: (publication: Publication) => Promise<void>;
    verifyTarget: (spec: JobSpec) => void;
    limit?: number;
    shouldStop?: () => boolean;
    log?: (event: unknown) => void;
  },
) {
  const collection = jobCollection(db, name);
  const manifest = await readManifest(collection);
  if (manifest.spec.source.database !== db.databaseName)
    throw new Error("Job source database does not match connection");
  if (manifest.state !== "ready")
    throw new Error("Job is still seeding; resume its plan before running");
  verifyTarget(manifest.spec);
  const lease = await acquireJobLease(collection);
  const counts = { processed: 0, written: 0, failed: 0, blocked: 0 };
  try {
    // 持有任务集排他租约后恢复崩溃的在途任务；较大的成功 ID 不会跳过这些商品。
    await lease.assertActive();
    await collection.updateMany(
      { kind: "task", status: "running" },
      { $set: { status: "pending" }, $unset: { owner: "" } },
    );
    while (!shouldStop() && counts.processed < limit) {
      const task = await claimTask(collection, lease);
      if (!task) break;
      log({
        event: "publication_row_started",
        job: name,
        productId: task.productId,
        attempt: task.attempts,
      });
      try {
        const document = await db
          .collection<SourceCompletion>(manifest.spec.source.collection)
          .findOne({ _id: task.sourceId });
        if (!document || document.productId !== task.productId)
          throw new PublicationInputError(
            "Planned source record is missing or its productId changed",
          );
        const publication = preparePublication(document, manifest.spec);
        if (publicationHash(publication) !== task.inputHash)
          throw new PublicationInputError(
            "Source payload changed after planning; create a new batch",
          );
        await lease.assertActive();
        await publish(publication);
      } catch (error) {
        if (fatal(error)) throw error;
        const status =
          error instanceof PublicationInputError ? "blocked" : "failed";
        const message = error instanceof Error ? error.message : String(error);
        await finishTask(collection, lease, task, status, message);
        counts.processed++;
        counts[status]++;
        log({
          event: "publication_row_failed",
          job: name,
          productId: task.productId,
          status,
          error: message,
        });
        // 保留之前明确约定：缺失 products.id 时记录失败并停止，不创建商品、不静默跳过。
        if (error instanceof MissingProductMappingError) throw error;
        continue;
      }
      // SQL 成功后才确认；这里失败必须停止，不把已发布的结果误当作业务失败。
      await finishTask(collection, lease, task, "succeeded");
      counts.processed++;
      counts.written++;
      log({
        event: "publication_row_written",
        job: name,
        productId: task.productId,
        ...counts,
      });
    }
    return counts;
  } finally {
    await lease.close();
  }
}
