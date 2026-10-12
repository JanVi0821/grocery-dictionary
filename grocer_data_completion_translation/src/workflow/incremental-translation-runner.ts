import type { Collection } from 'mongodb';
import { processRow } from './row.ts';
import { markTranslationCompleted } from './completion.ts';
import type { SourceDocument, TranslationTarget, TranslateText } from '../types/translation.ts';

/** 普通增量：按目标最大 productId 续跑，每批最多 100 条，成功及数据失败均推进游标。 */
export async function runIncrementalTranslation(
  source: Pick<Collection<SourceDocument>, 'find' | 'updateOne'>,
  target: TranslationTarget,
  {
    limit = Infinity,
    translate,
    provider,
    shouldStop = () => false,
    onCheckpoint,
    log = (value: unknown) => console.log(JSON.stringify(value)),
  }: {
    limit?: number;
    translate?: TranslateText;
    provider?: string;
    shouldStop?: () => boolean;
    onCheckpoint?: (processed: number) => Promise<void>;
    log?: (value: unknown) => void;
  } = {},
) {
  const counts = { processed: 0, written: 0, failed: 0 };
  // Includes failed rows: these have been attempted and are retried separately.
  const latest = await target.findOne(
    {},
    { sort: { productId: -1 }, projection: { productId: 1 } },
  );
  let afterProductId = latest?.productId;
  while (!shouldStop() && counts.processed < limit) {
    const rows = await source
      .find({
        needsReview: false,
        ...(afterProductId !== undefined ? { productId: { $gt: afterProductId } } : {}),
      })
      .sort({ productId: 1 })
      .limit(Math.min(100, limit - counts.processed))
      .toArray();
    if (!rows.length) break;
    for (const row of rows) {
      if (shouldStop()) break;
      log({
        event: 'row_started',
        productId: row.productId,
        source: row.source,
        _id: row._id,
      });
      const result = await processRow(row, target, {
        translate,
        provider,
        onCompleted: () => markTranslationCompleted(source, row),
        onProcessed: (data) =>
          log({
            event: 'row_processed',
            product_name: data.product_name,
            productId: data.productId,
          }),
      });
      afterProductId = row.productId;
      counts.processed++;
      if (typeof result === 'string') counts[result]++;
      else {
        counts.failed++;
      }
      if (counts.processed % 10 === 0) await onCheckpoint?.(counts.processed);
    }
    log(counts);
  }
  return counts;
}
