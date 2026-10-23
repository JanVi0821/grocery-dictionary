/** 每个 filter 独立集合：首次完整导入商品，重复执行仅继续集合内未完成的任务。 */
import { parseCli } from "../cli.ts";
import { runCrawlCommand } from "./runtime.ts";
import {
  registerFilteredTasks,
  runFilteredCrawl,
} from "../workflow/filtered.ts";
const cli = parseCli(process.argv, { defaultLimit: 100000 });
await runCrawlCommand(cli, registerFilteredTasks, (crawler) =>
  runFilteredCrawl(crawler, cli.limit, cli.rate),
);
