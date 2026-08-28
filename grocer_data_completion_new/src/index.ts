import { parseCli } from "./cli.ts";
import { crawler, router } from "./crawler.ts";
import {
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
    const duplicates = cli.retryNeedsReview
      ? await duplicateProductIdReport()
      : { count: 0, examples: [] as number[] };
    const retryIds = cli.retryNeedsReview
      ? await retryProductIds(cli.limit)
      : [];
    const afterId = cli.retryNeedsReview ? 0 : await latestProductId();
    const plan = planStart({
      retryNeedsReview: cli.retryNeedsReview,
      latestProductId: afterId,
      retryIds,
      duplicates,
    });
    if (plan.abort) {
      console.error(duplicateAbortMessage(plan.duplicates));
      code = 1;
    } else {
      console.log(
        `[start] runMode=${plan.mode} limit=${cli.limit} rate=${cli.rate} products/s (not HTTP requests/s) storeMode=${cli.storeMode} foodstuffsRequestDelay=${cli.foodstuffsRequestDelay}ms`,
      );
      if (plan.mode === "retry") {
        console.log(`[start] retry-needs-review count=${plan.retryIds.length}`);
        if (plan.retryIds.length) {
          await crawler.run([
            createRetryTask(plan.retryIds, plan.retryIds.length, plan.retryIds.length),
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
