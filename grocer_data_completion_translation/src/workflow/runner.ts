import type { Collection } from 'mongodb';
import { processRow } from './row.ts';
import type { SourceDocument, TranslationTarget, TranslateText } from '../types.ts';

export async function runTranslation(
  source: Pick<Collection<SourceDocument>, 'find'>,
  target: TranslationTarget,
  {
    limit = Infinity,
    dryRun = false,
    translate,
    provider,
    shouldStop = () => false,
    onCheckpoint,
    log = (value: unknown) => console.log(JSON.stringify(value)),
  }: {
    limit?: number;
    dryRun?: boolean;
    translate?: TranslateText;
    provider?: string;
    shouldStop?: () => boolean;
    onCheckpoint?: (processed: number) => Promise<void>;
    log?: (value: unknown) => void;
  } = {},
) {
  const counts = { processed: 0, written: 0, previewed: 0, failed: 0 };
  // Includes failed rows: these have been attempted and are retried separately.
  const latest = await target.findOne({}, { sort: { _id: -1 }, projection: { _id: 1 } });
  let afterId = latest?._id;
  while (!shouldStop() && counts.processed < limit) {
    const rows = await source
      .find({
        needsReview: false,
        ...(afterId ? { _id: { $gt: afterId } } : {}),
      })
      .sort({ _id: 1 })
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
        dryRun,
        translate,
        provider,
        onProcessed: (data) =>
          log({
            event: 'row_processed',
            dryRun,
            product_name: data.product_name,
            productId: data.productId,
          }),
      });
      afterId = row._id;
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
