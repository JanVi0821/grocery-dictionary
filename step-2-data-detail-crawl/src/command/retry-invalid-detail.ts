/** 独立命令：npm run retry:invalid-detail；重复执行只查询尚无当前版本标记的对应重试任务。 */
import { parseCli } from "../cli.ts";
import { runCrawlCommand } from "./runtime.ts";
import {
  registerInvalidDetailRetryTasks,
  runInvalidDetailRetry,
} from "../workflow/retry-invalid-detail.ts";
const cli = parseCli(process.argv, { defaultLimit: 0 });
await runCrawlCommand(cli, registerInvalidDetailRetryTasks, (crawler) =>
  runInvalidDetailRetry(crawler, cli.limit, cli.rate),
);
