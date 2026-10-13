/**
 * 失败记录重试入口：npm run retry:failed -- --limit 100。
 * --concurrency 控制商品间并发；行内字段顺序执行，Redis 缓存每次翻译成功即时保存。
 *
 * 运行逻辑：从目标集合读取 translation.status=failed 的记录，每批最多 100 条，
 * 按 productId 回原表取最新原文，使用本次 --provider 重新翻译并按 productId 覆盖结果。
 * 成功后状态改为 completed，并更新原表 COMPLETE_MARK；源记录找不到则保留失败结果。
 *
 * 重复执行：每次重新查询失败记录，已成功的记录自动排除，仍失败的记录会再次尝试。
 * 批内 _id 游标只在本次运行有效，不保存跨次游标；持续失败的低 _id 记录可能占用 --limit。
 * 不重译 completed 记录，也不根据 VERSION 或 COMPLETE_MARK 过滤任务。
 *
 * 配置：使用 LANG、SOURCE_COLLECTION、TARGET_COLLECTION、COMPLETE_MARK；不使用 FILTER。
 * --limit 包含失败及找不到源记录的任务；接口重试耗尽或数据库错误会停止本次运行。
 * 目标 _id 只用于本次分页，不用于关联原表；源、目标 _id 可以不同。
 */
import { createDatabaseConnection } from '../db/mongodb.ts';
import { LANG, SOURCE_COLLECTION, TARGET_COLLECTION } from '../config/translation.ts';
import { parseTranslationArgs } from './args.ts';
import { initializeProvider } from '../providers/initialize-provider.ts';
import { runFailedTranslationRetry } from '../workflow/retry-failed.ts';
import type { SourceDocument, TranslatedDocument } from '../types/translation.ts';

const { provider, limit, concurrency } = parseTranslationArgs(process.argv.slice(2));
const { client, db } = createDatabaseConnection();
let translator: Awaited<ReturnType<typeof initializeProvider>> | undefined;
let stopping = false;
process.once('SIGINT', () => (stopping = true));
process.once('SIGTERM', () => (stopping = true));
try {
  translator = await initializeProvider(provider);
  await client.connect();
  const target = db.collection<TranslatedDocument>(TARGET_COLLECTION);
  await target.createIndex({ productId: 1 }, { unique: true, name: 'productId_unique' });
  console.log(
    JSON.stringify({
      mode: 'retry-failed',
      source: SOURCE_COLLECTION,
      target: TARGET_COLLECTION,
      lang: LANG,
      provider: translator.id,
      concurrency,
    }),
  );
  const counts = await runFailedTranslationRetry(
    db.collection<SourceDocument>(SOURCE_COLLECTION),
    target,
    {
      limit,
      translate: translator.translate,
      provider: translator.id,
      shouldStop: () => stopping,
      concurrency,
      assertRunning: translator.assertRunning,
    },
  );
  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
  if (stopping) process.exitCode = 130;
} finally {
  await Promise.all([client.close(), translator?.close()]);
}
