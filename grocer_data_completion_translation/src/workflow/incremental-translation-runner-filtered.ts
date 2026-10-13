import type { Collection, Filter } from 'mongodb';
import { COMPLETE_MARK, FILTER } from '../config/translation.ts';
import { processRow } from './row.ts';
import { markTranslationCompleted } from './completion.ts';
import { runConcurrentBatch } from './concurrent-batch.ts';
import type { SourceDocument, TranslatedDocument, TranslateText } from '../types/translation.ts';

/** filtered 增量流程：按 FILTER + 原表完成标记续跑，目标按 productId upsert。 */
export async function runFilteredIncrementalTranslation(
  source: Pick<Collection<SourceDocument>, 'find' | 'updateOne'>,
  target: Pick<Collection<TranslatedDocument>, 'replaceOne'>,
  {
    filter = FILTER,
    limit = Infinity,
    translate,
    provider,
    shouldStop = () => false,
    concurrency = 1,
    assertRunning = async () => {},
    log = (value: unknown) => console.log(JSON.stringify(value)),
  }: {
    filter?: Filter<SourceDocument>;
    limit?: number;
    translate?: TranslateText;
    provider?: string;
    shouldStop?: () => boolean;
    concurrency?: number;
    assertRunning?: () => Promise<void>;
    log?: (value: unknown) => void;
  } = {},
) {
  const counts = { processed: 0, written: 0, failed: 0 };
  let afterId: SourceDocument['_id'] | undefined;
  while (!shouldStop() && counts.processed < limit) {
    const conditions: Filter<SourceDocument>[] = [filter];
    const completed = Object.entries(COMPLETE_MARK).map(([field, value]) => ({
      [field]: { $exists: true, $eq: value },
    }));
    // 只有所有标记字段都已存在且等于当前配置，才视为本轮已经完成。
    // $eq 将标记值作为字面量比较；$exists 避免 null 标记把缺失字段也当作已完成。
    if (completed.length) conditions.push({ $nor: [{ $and: completed }] });
    // 批内游标仅在本次执行有效；重启后通过原表标记跳过成功项，失败项仍可重试。
    if (afterId) conditions.push({ _id: { $gt: afterId } });
    const rows = await source
      .find({ $and: conditions })
      .sort({ _id: 1 })
      .limit(Math.min(100, limit - counts.processed))
      .toArray();
    if (!rows.length) break;
    await runConcurrentBatch(
      rows,
      concurrency,
      async (row, assertActive, worker) => {
        log({
          event: 'filtered_row_started',
          worker,
          productId: row.productId,
          source: row.source,
          _id: row._id,
        });
        const result = await processRow(row, target, {
          translate: translate
            ? async (text, context) => {
                await assertActive();
                return translate(text, context);
              }
            : undefined,
          provider,
          beforeWrite: assertActive,
          onCompleted: async () => {
            await assertActive();
            await markTranslationCompleted(source, row);
          },
          onProcessed: (data) =>
            log({
              event: 'filtered_row_processed',
              product_name: data.product_name,
              productId: data.productId,
            }),
        });
        counts.processed++;
        if (typeof result === 'string') counts[result]++;
        else counts.failed++;
      },
      shouldStop,
      assertRunning,
    );
    afterId = rows.at(-1)!._id;
    log(counts);
  }
  return counts;
}
