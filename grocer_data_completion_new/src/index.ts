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
  latestProductId,
  invalidDetailProductIds,
  retryProductIds,
} from "./db.ts";
import { RETRY_ALL_VERSION, RETRY_INVALID_DETAIL_VERSION } from "./retry-config.ts";

registerTasks(router);

const cli = parseCli(process.argv);
setTaskIntervalMs(1000 / cli.rate);
setStoreMode(cli.storeMode);
setFoodstuffsRequestDelay(cli.foodstuffsRequestDelay);

let code = 0;

async function runRetryAll(limit: number) {
  const retryIds = await retryProductIds(limit);
  console.log(
    `[start] runMode=retry-all version=${RETRY_ALL_VERSION} limit=${limit} count=${retryIds.length} rate=${cli.rate} products/s storeMode=${cli.storeMode}`,
  );
  if (retryIds.length === 0) return;

  await crawler.run([
    createRetryTask(retryIds, retryIds.length, retryIds.length),
  ]);
}

async function runRetryInvalidDetail(limit: number) {
  const retryIds = await invalidDetailProductIds(limit);
  let limitLabel = String(limit);
  if (limit === 0) limitLabel = "all";
  console.log(
    `[start] runMode=retry-invalid-detail version=${RETRY_INVALID_DETAIL_VERSION} limit=${limitLabel} count=${retryIds.length} rate=${cli.rate} products/s storeMode=${cli.storeMode}`,
  );
  if (retryIds.length === 0) return;

  await crawler.run([
    createInvalidDetailRetryTask(retryIds, retryIds.length, retryIds.length),
  ]);
}

async function runIncremental(limit: number) {
  const afterId = await latestProductId();
  console.log(
    `[start] runMode=incremental latestProductId=${afterId} limit=${limit} rate=${cli.rate} products/s storeMode=${cli.storeMode}`,
  );
  await crawler.run([createTask(afterId, limit, limit)]);
}

try {
  if (cli.retryNeedsReview) {
    await runRetryAll(cli.limit);
  } else if (cli.retryInvalidDetail) {
    await runRetryInvalidDetail(cli.limit);
  } else {
    await runIncremental(cli.limit);
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
