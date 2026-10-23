/** 发布任务入口：plan 只建任务；run 才写 Supabase；status 只读；retry 只重开失败任务。 */
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { Pool } from "pg";
import { readLimit } from "@grocery/pipeline-infra/cli";
import { registerGracefulShutdown } from "@grocery/pipeline-infra/shutdown";
import {
  SOURCE_DATABASE,
  SOURCE_COLLECTION,
  ACTIVE_TRANSLATION_COLLECTION,
  ACTIVE_TRANSLATION_LANG,
  FILTER,
  TRANSLATION_FILTER,
  DETAIL_PUBLISH_VERSION,
  TRANSLATION_PUBLISH_VERSION,
  BATCH_SIZE,
} from "./config.ts";
import {
  endpointIdentity,
  jobCollection,
  jobStatus,
  readManifest,
  retryFailedTasks,
  type JobSpec,
} from "../jobs/store.ts";
import { planPublicationJob } from "./plan.ts";
import { runPublicationJob, writePublication } from "./run.ts";

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (
    !["plan:details", "plan:translations", "run", "status", "retry"].includes(
      action ?? "",
    )
  )
    throw new Error("Unknown publication job action");
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      job: { type: "string" },
      batch: { type: "string" },
      limit: { type: "string" },
    },
  });
  const planning = action!.startsWith("plan:");
  if (planning && (values.job !== undefined || values.limit !== undefined))
    throw new Error(
      "plan imports all matching records; --job / --limit are not supported",
    );
  if (!planning && (!values.job || values.batch !== undefined))
    throw new Error("run/status/retry require --job and do not accept --batch");
  if (action !== "run" && values.limit !== undefined)
    throw new Error("--limit is only supported by jobs:run");
  const limit = readLimit(
    values.limit === undefined ? [] : ["--limit", values.limit],
  );
  const mongoRaw = process.env.MONGODB_URI?.trim();
  if (!mongoRaw) throw new Error("MONGODB_URI missing");
  const mongoUrl = new URL(mongoRaw);
  mongoUrl.pathname = "/";
  const mongoEndpoint = endpointIdentity(mongoUrl.toString());
  const mongo = new MongoClient(mongoUrl.toString(), {
    serverSelectionTimeoutMS: 10000,
  });
  const db = mongo.db(SOURCE_DATABASE);
  const shutdown = registerGracefulShutdown();
  let pool: Pool | undefined;
  try {
    await mongo.connect();
    if (planning) {
      const postgres = process.env.SUPABASE_DB_URL?.trim();
      if (!postgres)
        throw new Error(
          "SUPABASE_DB_URL missing (required to bind job to its target project)",
        );
      const translated = action === "plan:translations";
      const spec: JobSpec = {
        stage: translated ? "publish:translations" : "publish:details",
        source: {
          endpoint: mongoEndpoint,
          database: SOURCE_DATABASE,
          collection: translated
            ? ACTIVE_TRANSLATION_COLLECTION
            : SOURCE_COLLECTION,
        },
        target: {
          endpoint: endpointIdentity(postgres),
          table: translated ? "product_translations" : "products",
        },
        filter: translated ? TRANSLATION_FILTER : FILTER,
        lang: translated ? ACTIVE_TRANSLATION_LANG : null,
        version: translated
          ? TRANSLATION_PUBLISH_VERSION
          : DETAIL_PUBLISH_VERSION,
        batch: values.batch?.trim() ?? "default",
      };
      const name = await planPublicationJob(db, spec, {
        shouldStop: shutdown.shouldStop,
        batchSize: BATCH_SIZE,
      });
      console.log(JSON.stringify(await jobStatus(jobCollection(db, name))));
      return;
    }
    const collection = jobCollection(db, values.job!);
    if (action === "status") {
      console.log(JSON.stringify(await jobStatus(collection)));
      return;
    }
    if (action === "retry") {
      const reopened = await retryFailedTasks(collection);
      console.log(
        JSON.stringify({
          event: "publication_failed_tasks_reopened",
          reopened,
          ...(await jobStatus(collection)),
        }),
      );
      return;
    }
    const postgres = process.env.SUPABASE_DB_URL?.trim();
    if (!postgres) throw new Error("SUPABASE_DB_URL missing");
    // 校验来源与目标身份后才运行；不能把同一个 job 指向另一个 Supabase 项目。
    const spec = (await readManifest(collection)).spec;
    if (
      spec.source.endpoint !== mongoEndpoint ||
      spec.source.database !== db.databaseName ||
      spec.target.endpoint !== endpointIdentity(postgres)
    )
      throw new Error(
        "Current database/project does not match the planned job",
      );
    pool = new Pool({
      connectionString: postgres,
      max: 1,
      connectionTimeoutMillis: 10000,
      statement_timeout: 60000,
    });
    const counts = await runPublicationJob(db, values.job!, {
      limit,
      shouldStop: shutdown.shouldStop,
      verifyTarget: (planned) => {
        if (planned.target.endpoint !== endpointIdentity(postgres))
          throw new Error("Job target changed");
      },
      publish: (publication) => writePublication(pool!, publication),
    });
    const status = await jobStatus(collection);
    console.log(
      JSON.stringify({
        event: "publication_run_finished",
        ...counts,
        ...status,
      }),
    );
    if (
      counts.failed ||
      counts.blocked ||
      status.counts.failed ||
      status.counts.blocked
    )
      process.exitCode = 1;
  } finally {
    await shutdown.close([() => mongo.close(), () => pool?.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "publication_job_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
