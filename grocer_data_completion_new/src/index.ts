import { parseCli } from "./cli.ts";
import { crawler, router } from "./crawler.ts";
import {
  createInvalidDetailRetryTask,
  createRetryTask,
  createTask,
  registerTasks,
  setStoreMode,
  setTaskIntervalMs,
} from "./crawlers/index.ts";
import { setFoodstuffsRequestDelay } from "./crawlers/foodstuffs/request.ts";
import {
  closeDb,
  duplicateProductIdReport,
  ensureProductIdUniqueIndex,
  latestProductId,
  invalidDetailProductIds,
  retryProductIds,
} from "./db.ts";
import { duplicateAbortMessage, planStart } from "./start-plan.ts";

registerTasks(router);

const cli = parseCli(process.argv);
setTaskIntervalMs(1000 / cli.rate);
setStoreMode(cli.storeMode);
setFoodstuffsRequestDelay(cli.foodstuffsRequestDelay);

let code = 0;
try {
  if (cli.ensureUniqueProductId) {
    await ensureProductIdUniqueIndex();
    console.log("[index] unique index productId_unique created");
  } else {
    const isRetryMode = cli.retryNeedsReview || cli.retryInvalidDetail;
    const duplicates = isRetryMode
      ? await duplicateProductIdReport()
      : { count: 0, examples: [] as number[] };
    const retryIds = cli.retryNeedsReview
      ? await retryProductIds(cli.limit)
      : cli.retryInvalidDetail
        ? await invalidDetailProductIds(cli.limit)
        : [];
    const afterId = isRetryMode ? 0 : await latestProductId();
    const plan = planStart({
      retryNeedsReview: cli.retryNeedsReview,
      retryInvalidDetail: cli.retryInvalidDetail,
      latestProductId: afterId,
      retryIds,
      duplicates,
    });
    if (plan.abort) {
      console.error(duplicateAbortMessage(plan.duplicates));
      code = 1;
    } else {
      console.log(
        `[start] runMode=${plan.mode} limit=${cli.retryInvalidDetail && cli.limit === 0 ? "all" : cli.limit} rate=${cli.rate} products/s (not HTTP requests/s) storeMode=${cli.storeMode} foodstuffsRequestDelay=${cli.foodstuffsRequestDelay}ms`,
      );
      if (plan.mode === "retry") {
        console.log(`[start] retry-needs-review count=${plan.retryIds.length}`);
        if (plan.retryIds.length) {
          await crawler.run([
            createRetryTask(plan.retryIds, plan.retryIds.length, plan.retryIds.length),
          ]);
        }
      } else if (plan.mode === "retry-invalid-detail") {
        console.log(`[start] retry-invalid-detail count=${plan.retryIds.length}`);
        if (plan.retryIds.length) {
          await crawler.run([
            createInvalidDetailRetryTask(
              plan.retryIds,
              plan.retryIds.length,
              plan.retryIds.length,
            ),
          ]);
        }
      } else {
        console.log(`[start] latestProductId=${plan.afterId}`);
        await crawler.run([createTask(plan.afterId, cli.limit, cli.limit)]);
      }
    }
  }
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  try {
    await crawler.teardown();
  } catch (err) {
    console.error(err);
    code = 1;
  }
  try {
    await closeDb();
  } catch (err) {
    console.error(err);
    code = 1;
  }
}
process.exit(code);
