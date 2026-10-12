import type { Collection } from 'mongodb';
import { processRow } from './row.ts';
import { markTranslationCompleted } from './completion.ts';
import type {
  SourceDocument,
  TranslatedDocument,
  TranslationTarget,
  TranslateText,
} from '../types/translation.ts';

/** Explicit retry path: only failed target rows are considered. */
export async function retryFailedTranslations(
  source: Pick<Collection<SourceDocument>, 'findOne' | 'updateOne'>,
  target: Pick<Collection<TranslatedDocument>, 'find'> & TranslationTarget,
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

    for (const failed of failedRows) {
      if (shouldStop()) break;
      afterId = failed._id;
      const row = await source.findOne({ productId: failed.productId });
      if (!row) {
        counts.processed++;
        counts.failed++;
        counts.sourceMissing++;
        log({ event: 'retry_source_missing', _id: failed._id, productId: failed.productId });
        if (counts.processed % 10 === 0) await onCheckpoint?.(counts.processed);
        continue;
      }
      log({
        event: 'row_retry_started',
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
            event: 'row_retry_processed',
            product_name: data.product_name,
            productId: data.productId,
          }),
      });
      counts.processed++;
      if (typeof result === 'string') counts[result]++;
      else counts.failed++;
      if (counts.processed % 10 === 0) await onCheckpoint?.(counts.processed);
    }
    log(counts);
  }
  return counts;
}
