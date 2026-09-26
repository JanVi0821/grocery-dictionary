import type { TranslateText } from '../types.ts';
import { withTranslationRetry } from './retry.ts';
import { withShortTextCache } from './cache.ts';
import { readCacheSnapshot, writeCacheSnapshot } from './cache-file.ts';
import { LANG } from '../config.ts';
import { withRequestRateLimit } from './rate-limit.ts';

export type ProviderName = 'google' | 'baidu' | 'baidu-llm' | 'deepl';
export interface TranslationProvider {
  id: string;
  translate: TranslateText;
  close: () => Promise<void>;
  saveCache?: (lang: string) => Promise<string>;
}

/** Backwards-compatible default for direct row processing; the CLI injects its provider. */
export const translateWithDefaultGoogle: TranslateText = withShortTextCache(
  withTranslationRetry(
    withRequestRateLimit(async (text, context) => {
      const google = await import('./google.ts');
      return google.translateText(text, context);
    }),
    'google-v3',
  ),
);

/** Load credentials and SDK resources only for the selected service. */
export async function selectProvider(name: ProviderName): Promise<TranslationProvider> {
  const provider = await initializeProvider(name);
  const previousCache = await readCacheSnapshot(LANG);
  console.log(
    JSON.stringify({
      event: 'translation_cache_loaded',
      provider: provider.id,
      lang: LANG,
      entries: Object.keys(previousCache).length,
    }),
  );
  const translate = withShortTextCache(
    withTranslationRetry(withRequestRateLimit(provider.translate), provider.id),
    undefined,
    previousCache,
    LANG,
  );
  return {
    ...provider,
    translate,
    saveCache: (lang) => writeCacheSnapshot(translate.snapshot(lang), lang),
  };
}

async function initializeProvider(name: ProviderName): Promise<TranslationProvider> {
  switch (name) {
    case 'deepl': {
      const { initializeDeeplTranslator } = await import('./deepl.ts');
      return { id: name, translate: initializeDeeplTranslator(), close: async () => {} };
    }
    case 'google': {
      const google = await import('./google.ts');
      try {
        await google.initializeTranslator();
      } catch (error) {
        await google.closeTranslator();
        throw error;
      }
      return { id: 'google-v3', translate: google.translateText, close: google.closeTranslator };
    }
    case 'baidu': {
      const { initializeBaiduTranslator } = await import('./baidu.ts');
      return { id: name, translate: initializeBaiduTranslator(), close: async () => {} };
    }
    case 'baidu-llm': {
      const { initializeBaiduLlmTranslator } = await import('./baidu-llm.ts');
      return { id: name, translate: initializeBaiduLlmTranslator(), close: async () => {} };
    }
  }
}
