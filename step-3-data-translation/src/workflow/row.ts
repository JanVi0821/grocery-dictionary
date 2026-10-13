import { prepareRowTranslation } from './fields.ts';
import { LANG, PROVIDER, VERSION } from '../config/translation.ts';
import { translateWithDefaultGoogle } from '../providers/initialize-provider.ts';
import { TranslationServiceError } from '../providers/errors.ts';
import type {
  SourceDocument,
  TranslatedDocument,
  TranslationTarget,
  TranslateText,
} from '../types/translation.ts';

export async function translateRow(
  row: SourceDocument,
  translate: TranslateText = translateWithDefaultGoogle,
  provider: string = PROVIDER,
): Promise<TranslatedDocument> {
  const { copy, slots } = prepareRowTranslation(row);
  // Case-insensitive source text keys; this cache lives only for the current row.
  const cache = new Map<string, string>();
  for (const { node, key, path, text } of slots) {
    const cacheKey = text.toLowerCase();
    let result = cache.get(cacheKey);
    if (result === undefined) {
      result = await translate(text, { lang: LANG, source: row.source, path, product: row });
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
  target: Pick<TranslationTarget, 'replaceOne'>,
  {
    translate = translateWithDefaultGoogle,
    provider = PROVIDER,
    onCompleted,
    onProcessed,
    beforeWrite,
    taskId,
  }: {
    translate?: TranslateText;
    provider?: string;
    onCompleted?: () => Promise<void>;
    onProcessed?: (result: TranslatedDocument) => void;
    beforeWrite?: () => Promise<void>;
    taskId?: string;
  } = {},
): Promise<'written' | { failed: true; message: string }> {
  const { result, failure } = await translateRowOrBuildFailure(row, translate, provider);
  if (taskId) result.translation.taskId = taskId;
  // 三个流程统一按唯一 productId upsert，不覆盖目标集合不可修改的 _id。
  // 成功和普通数据失败均先落库，再推进游标；数据库错误直接终止任务。
  const { _id, ...replacement } = result;
  await beforeWrite?.();
  await target.replaceOne({ productId: row.productId }, replacement, { upsert: true });
  if (failure === undefined) await onCompleted?.();
  onProcessed?.(result);
  if (failure !== undefined) return { failed: true, message: failure };
  return 'written';
}

async function translateRowOrBuildFailure(
  row: SourceDocument,
  translate: TranslateText,
  provider: string,
): Promise<{ result: TranslatedDocument; failure?: string }> {
  try {
    return { result: await translateRow(row, translate, provider) };
  } catch (error) {
    if (error instanceof TranslationServiceError) throw error;
    const failure = error instanceof Error ? error.message : String(error);
    const result: TranslatedDocument = {
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
    return { result, failure };
  }
}
