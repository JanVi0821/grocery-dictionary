import type { Collection } from 'mongodb';
import { processRow } from './row.ts';
import { markTranslationCompleted } from './completion.ts';
import { runConcurrentBatch } from './concurrent-batch.ts';
import type {
  SourceDocument,
  TranslatedDocument,
  TranslationTarget,
  TranslateText,
} from '../types/translation.ts';

/** 失败重试：只读取目标失败项，按 productId 回原表取原文并覆盖翻译结果。 */
export async function runFailedTranslationRetry(
  source: Pick<Collection<SourceDocument>, 'findOne' | 'updateOne'>,
  target: Pick<Collection<TranslatedDocument>, 'find'> & TranslationTarget,
  {
    limit = Infinity,
    translate,
    provider,
    shouldStop = () => false,
    concurrency = 1,
    assertRunning = async () => {},
    log = (value: unknown) => console.log(JSON.stringify(value)),
  }: {
    limit?: number;
    translate?: TranslateText;
    provider?: string;
    shouldStop?: () => boolean;
    concurrency?: number;
    assertRunning?: () => Promise<void>;
    log?: (value: unknown) => void;
  } = {},
) {
  const counts = { processed: 0, written: 0, failed: 0, sourceMissing: 0 };
  let afterId: SourceDocument['_id'] | undefined;
  while (!shouldStop() && counts.processed < limit) {
    const failedRows = await target
      .find({ 'translation.status': 'failed', ...(afterId ? { _id: { $gt: afterId } } : {}) })
      .project<Pick<SourceDocument, '_id' | 'productId'>>({ _id: 1, productId: 1 })
      .sort({ _id: 1 })
      .limit(Math.min(100, limit - counts.processed))
      .toArray();
    if (!failedRows.length) break;

    await runConcurrentBatch(
      failedRows,
      concurrency,
      async (failed, assertActive, worker) => {
        const row = await source.findOne({ productId: failed.productId });
        if (!row) {
          counts.processed++;
          counts.failed++;
          counts.sourceMissing++;
          log({ event: 'retry_source_missing', _id: failed._id, productId: failed.productId });
          return;
        }
        log({
          event: 'row_retry_started',
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
              event: 'row_retry_processed',
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
    afterId = failedRows.at(-1)!._id;
    log(counts);
  }
  return counts;
}
