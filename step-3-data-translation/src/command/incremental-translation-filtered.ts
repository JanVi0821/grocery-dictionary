/**
 * 带筛选条件的增量翻译入口：npm run translate:filter -- --limit 100。
 * --concurrency 控制商品间并发；行内字段顺序执行，Redis 缓存每次翻译成功即时保存。
 *
 * 运行逻辑：从原表查询 FILTER，并自动排除已具有当前 COMPLETE_MARK 全部字段和值的记录，
 * 按源 _id 升序、每批最多 100 条翻译，
 * 按 productId upsert 目标集合（已有则替换，不存在则新增），成功后更新原表 COMPLETE_MARK。
 * 启动时确保 productId 唯一索引；目标已有重复 productId 时会停止，需先清理重复项。
 *
 * 重复执行：以原表完成标记作为跨次进度，已成功并写入当前标记的商品自动跳过。
 * 无需在 FILTER 中手动排除完成项，也不读取目标最大 productId；未完成或失败项仍会匹配。
 * 例如保持以下配置，分多次运行 --limit 100 即可逐批继续：
 *   FILTER = { retryAllVersion: 1 }
 *   COMPLETE_MARK = { completeTranslation: 1 }
 * 修改完成标记版本可处理新一轮任务；缓存命中时仍复用译文。
 * 若 COMPLETE_MARK={}，不会自动排除记录或更新原表，相同 --limit 可能反复处理前 N 条。
 *
 * 配置：使用 FILTER、LANG、SOURCE_COLLECTION、TARGET_COLLECTION、COMPLETE_MARK。
 * FILTER 是业务筛选条件，不自动追加 needsReview=false；需要时应自行配置。
 * 自动完成条件和批内 _id 游标通过 $and 叠加，保留 FILTER 自身的 _id 范围与其它条件。
 * 按 productId 更新保留目标已有 _id；新增时由 MongoDB 生成 _id，未必与源 _id 一致。
 * 译文落库和源标记更新是两次操作；标记失败会停止，可用本流程再次覆盖结果并补标记。
 */
import { createDatabaseConnection } from '../db/mongodb.ts';
import {
  COMPLETE_MARK,
  FILTER,
  LANG,
  SOURCE_COLLECTION,
  TARGET_COLLECTION,
} from '../config/translation.ts';
import { parseTranslationArgs } from './args.ts';
import { initializeProvider } from '../providers/initialize-provider.ts';
import { runFilteredIncrementalTranslation } from '../workflow/incremental-translation-runner-filtered.ts';
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
  const source = db.collection<SourceDocument>(SOURCE_COLLECTION);
  const target = db.collection<TranslatedDocument>(TARGET_COLLECTION);
  await target.createIndex({ productId: 1 }, { unique: true, name: 'productId_unique' });
  console.log(
    JSON.stringify({
      mode: 'incremental-translation-filtered',
      source: SOURCE_COLLECTION,
      target: TARGET_COLLECTION,
      filter: FILTER,
      completeMark: COMPLETE_MARK,
      lang: LANG,
      provider: translator.id,
      concurrency,
    }),
  );
  const counts = await runFilteredIncrementalTranslation(source, target, {
    filter: FILTER,
    limit,
    translate: translator.translate,
    provider: translator.id,
    shouldStop: () => stopping,
    concurrency,
    assertRunning: translator.assertRunning,
  });
  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
  if (stopping) process.exitCode = 130;
} finally {
  await Promise.all([client.close(), translator?.close()]);
}
