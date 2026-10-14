import type { PlaywrightCrawler } from "crawlee";
import type { parseCli } from "../cli.ts";
import { crawler, router } from "../crawler.ts";
import { closeDb } from "../db.ts";
import {
  crawlStopReason,
  setTaskIntervalMs,
} from "../crawlers/task-runtime.ts";
import { setFoodstuffsRequestDelay } from "../crawlers/foodstuffs/request.ts";
import type { TaskRouter } from "../crawlers/tasks.ts";
/** 仅共享配置、异常处理和资源释放；不按模式分发，也不包含业务查询。 */
export async function runCrawlCommand(
  cli: ReturnType<typeof parseCli>,
  register: (router: TaskRouter) => void,
  run: (crawler: PlaywrightCrawler) => Promise<void>,
) {
  register(router);
  setTaskIntervalMs(1000 / cli.rate);
  setFoodstuffsRequestDelay(cli.foodstuffsRequestDelay);
  let code = 0;
  try {
    await run(crawler);
    if (crawlStopReason) {
      console.error(`[stop] ${crawlStopReason}`);
      code = 1;
    }
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    try {
      await crawler.teardown();
    } catch (error) {
      console.error(error);
      code = 1;
    }
    try {
      await closeDb();
    } catch (error) {
      console.error(error);
      code = 1;
    }
  }
  process.exitCode = code;
}
