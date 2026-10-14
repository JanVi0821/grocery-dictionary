/** 普通增量命令：npm run crawl:10000；重复执行从目标最大 productId 之后继续抓取。 */
import { parseCli } from "../cli.ts";
import { runCrawlCommand } from "./runtime.ts";
import {
  registerIncrementalTasks,
  runIncrementalCrawl,
} from "../workflow/incremental.ts";
const cli = parseCli(process.argv, { defaultLimit: 1 });
await runCrawlCommand(cli, registerIncrementalTasks, (crawler) =>
  runIncrementalCrawl(crawler, cli.limit, cli.rate),
);
