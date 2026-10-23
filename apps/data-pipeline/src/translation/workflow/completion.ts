import type { Collection } from 'mongodb';
import { COMPLETE_MARK } from '../config/translation.ts';
import type { SourceDocument } from '../types/translation.ts';

/** Called only after a completed translation has been persisted. */
export async function markTranslationCompleted(
  source: Pick<Collection<SourceDocument>, 'updateOne'>,
  row: SourceDocument,
) {
  if (Object.keys(COMPLETE_MARK).length === 0) return;
  const result = await source.updateOne({ _id: row._id }, { $set: COMPLETE_MARK });
  if (result.matchedCount !== 1) {
    throw new Error(`Cannot mark completed translation: source document ${row._id} not found`);
  }
}
