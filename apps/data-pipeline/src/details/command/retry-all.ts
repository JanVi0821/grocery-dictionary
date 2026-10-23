/** 独立命令：pnpm data details:retry:unmatched；重复执行只查询尚无当前版本标记的对应重试任务。 */
import { parseCli } from "../cli.ts";
import { runCrawlCommand } from "./runtime.ts";
import { registerRetryAllTasks, runRetryAll } from "../workflow/retry-all.ts";
const cli = parseCli(process.argv, { defaultLimit: 1 });
await runCrawlCommand(cli, registerRetryAllTasks, (crawler) =>
  runRetryAll(crawler, cli.limit, cli.rate),
);
