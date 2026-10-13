/**
 * 增量翻译入口：npm run translate:deepl -- --limit 100（npm start 也使用此入口）。
 *
 * 运行逻辑：先恢复 TASK_COLLECTION 中未完成的待办，再从目标最大 productId 之后读取原表。
 * 原表新任务必须 needsReview=false，按 productId 升序每批最多 100 条，先存待办再并发翻译。
 * 成功落库后更新原表 COMPLETE_MARK；普通数据错误写为 failed，接口重试耗尽则停止。
 *
 * 重复执行：优先恢复小 ID 待办，避免并发乱序完成导致遗漏，再按最大 productId 续跑。
 * 结果已写但标记/待办尚未完成时，通过 translation.taskId 补完提交，不再调用 API。
 * 不会重译旧记录，也不会补齐游标之前的缺失数据；修改 provider、VERSION 不会触发重译。
 * --limit 只限制本次处理总数；未保存的当前行在下次重新翻译，不保存行内进度。
 *
 * 配置：使用 LANG、SOURCE_COLLECTION、TARGET_COLLECTION、COMPLETE_MARK；不使用 FILTER。
 * 注意：productId 是数值业务键，不代表插入时间；只运行一个实例。
 * 目标存在较大 productId（例如 filter 先写入），或新补入较小 productId 时，需用 filter 补跑。
 * 译文落库与源标记更新不是事务；标记失败保留待办，下次可自动补标记。
 */
import { createDatabaseConnection } from '../db/mongodb.ts';
import {
  SOURCE_COLLECTION,
  TARGET_COLLECTION,
  LANG,
  TASK_COLLECTION,
} from '../config/translation.ts';
import {
  runIncrementalTranslation,
  type PendingTranslationTask,
} from '../workflow/incremental-translation-runner.ts';
import { initializeProvider, type TranslationProvider } from '../providers/initialize-provider.ts';
import { parseTranslationArgs } from './args.ts';
import type { SourceDocument, TranslatedDocument } from '../types/translation.ts';

const { provider, limit, concurrency } = parseTranslationArgs(process.argv.slice(2));
const { client, db } = createDatabaseConnection();
let translator: TranslationProvider | undefined;
let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});
try {
  translator = await initializeProvider(provider);
  await client.connect();
  const target = db.collection<TranslatedDocument>(TARGET_COLLECTION);
  await target.createIndex({ productId: 1 }, { unique: true, name: 'productId_unique' });
  console.log(
    JSON.stringify({
      source: SOURCE_COLLECTION,
      target: TARGET_COLLECTION,
      lang: LANG,
      provider: translator.id,
      concurrency,
    }),
  );
  const source = db.collection<SourceDocument>(SOURCE_COLLECTION);
  const options = {
    limit,
    translate: translator.translate,
    provider: translator.id,
    shouldStop: () => stopping,
    concurrency,
    tasks: db.collection<PendingTranslationTask>(TASK_COLLECTION),
    assertRunning: translator.assertRunning,
  };
  const counts = await runIncrementalTranslation(source, target, options);
  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
  if (stopping) process.exitCode = 130;
} finally {
  await Promise.all([client.close(), translator?.close()]);
}
