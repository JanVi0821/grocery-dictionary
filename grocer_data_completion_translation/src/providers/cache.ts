import { GLOBAL_CACHE_MAX_CHARS } from '../config.ts';
import type { TranslateText } from '../types.ts';

/** One cache per initialized translator, shared across rows for this run only. */
export function withShortTextCache(
  translate: TranslateText,
  maxChars = GLOBAL_CACHE_MAX_CHARS,
  initialCache: Record<string, string> = {},
  initialCacheLang = 'zh',
): TranslateText & { snapshot: (lang: string) => Record<string, string> } {
  const cache = new Map<string, string>(
    Object.entries(initialCache)
      .filter(
        ([text, result]) => maxChars > 0 && Array.from(text).length <= maxChars && result.trim(),
      )
      .map(([text, result]) => [JSON.stringify([initialCacheLang, text.toLowerCase()]), result]),
  );
  const cachedTranslate: TranslateText = async (text, context) => {
    if (!text.trim() || maxChars <= 0 || Array.from(text).length > maxChars) {
      return translate(text, context);
    }
    // Provider isolation comes from each translator's separate closure.
    const key = JSON.stringify([context.lang, text.toLowerCase()]);
    const cached = cache.get(key);
    if (cached !== undefined) {
      console.log(
        JSON.stringify({
          event: 'translation_cache_hit',
          cache: 'global',
          source: context.source,
          lang: context.lang,
          field: context.path,
          text,
        }),
      );
      return cached;
    }
    const result = await translate(text, context);
    if (typeof result === 'string' && result.trim()) cache.set(key, result);
    return result;
  };
  return Object.assign(cachedTranslate, {
    snapshot: (lang: string) =>
      Object.fromEntries(
        [...cache].flatMap(([key, value]) => {
          const [cachedLang, text] = JSON.parse(key) as [string, string];
          return cachedLang === lang ? [[text, value]] : [];
        }),
      ),
  });
}
