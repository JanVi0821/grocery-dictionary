import { prepareTranslation } from './fields.ts';
import { LANG, PROVIDER, VERSION } from '../config.ts';
import { translateWithDefaultGoogle as translateText } from '../providers/select.ts';
import { TranslationServiceError } from '../providers/errors.ts';
import type {
  SourceDocument,
  TranslatedDocument,
  TranslationTarget,
  TranslateText,
} from '../types.ts';

export async function translateRow(
  row: SourceDocument,
  translate: TranslateText = translateText,
  provider: string = PROVIDER,
): Promise<TranslatedDocument> {
  const { copy, slots } = prepareTranslation(row);
  // Case-insensitive source text keys; this cache lives only for the current row.
  const cache = new Map<string, string>();
  for (const { node, key, path, text } of slots) {
    const cacheKey = text.toLowerCase();
    let result = cache.get(cacheKey);
    if (result === undefined) {
      result = await translate(text, { lang: LANG, source: row.source, path });
      if (typeof result !== 'string' || !result.trim())
        throw new Error(`Empty translation: ${path}`);
      cache.set(cacheKey, result);
    } else {
      console.log(
        JSON.stringify({
          event: 'translation_cache_hit',
          cache: 'row',
          productId: row.productId,
          source: row.source,
          lang: LANG,
          field: path,
          text,
        }),
      );
    }
    node[key] = result;
  }
  return {
    ...copy,
    translation: {
      status: 'completed',
      lang: LANG,
      provider,
      version: VERSION,
      fieldCount: slots.length,
      completedAt: new Date(),
    },
  };
}

export async function processRow(
  row: SourceDocument,
  target: TranslationTarget,
  {
    dryRun = false,
    translate = translateText,
    provider = PROVIDER,
    onProcessed,
  }: {
    dryRun?: boolean;
    translate?: TranslateText;
    provider?: string;
    onProcessed?: (result: TranslatedDocument) => void;
  } = {},
): Promise<'previewed' | 'written' | { failed: true; message: string }> {
  let result: TranslatedDocument;
  let failure: string | undefined;
  try {
    result = await translateRow(row, translate, provider);
  } catch (error) {
    if (error instanceof TranslationServiceError) throw error;
    failure = error instanceof Error ? error.message : String(error);
    // Keep original detail for later retry, never partly translated fields.
    result = {
      ...row,
      translation: {
        status: 'failed',
        lang: LANG,
        provider,
        version: VERSION,
        error: failure,
        failedAt: new Date(),
      },
    };
    delete result.attempts;
  }
  // Persist success OR failure before advancing the cursor. DB errors abort the run.
  if (!dryRun) await target.replaceOne({ _id: row._id }, result, { upsert: true });
  onProcessed?.(result);
  if (failure !== undefined) return { failed: true, message: failure };
  return dryRun ? 'previewed' : 'written';
}
