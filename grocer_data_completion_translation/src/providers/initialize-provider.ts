import type { TranslateText, Translator } from '../types/translation.ts';
import { withTranslationRetry } from './retry.ts';
import { withShortTextCache } from './cache.ts';
import { readCacheSnapshot, writeCacheSnapshot } from './cache-file.ts';
import { LANG } from '../config/translation.ts';

export type ProviderName = 'google' | 'deepl';
export interface TranslationProvider extends Translator {
  id: string;
  saveCache?: (lang: string) => Promise<string>;
}

/** Backwards-compatible default for direct row processing; the CLI injects its provider. */
let defaultGoogle: Promise<Translator> | undefined;
export const translateWithDefaultGoogle: TranslateText = withShortTextCache(
  withTranslationRetry(async (text, context) => {
    defaultGoogle ??= import('./google.ts')
      .then((google) => google.initializeTranslator())
      .catch((error) => {
        defaultGoogle = undefined;
        throw error;
      });
    return (await defaultGoogle).translate(text, context);
  }, 'google-v3'),
);

/** 初始化指定翻译服务，加载持久化缓存并装配重试，返回可执行的 provider 实例。 */
export async function initializeProvider(name: ProviderName): Promise<TranslationProvider> {
  const provider = await initializeProviderResources(name);
  try {
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
      withTranslationRetry(provider.translate, provider.id),
      undefined,
      previousCache,
      LANG,
    );
    return {
      ...provider,
      translate,
      saveCache: (lang) => writeCacheSnapshot(translate.snapshot(lang), lang),
    };
  } catch (error) {
    // 初始化缓存等后续步骤失败时，调用方拿不到实例，需在这里释放 SDK 资源。
    await provider.close();
    throw error;
  }
}

/** 仅初始化认证、key pool 和请求资源；缓存、重试由 initializeProvider 统一装配。 */
async function initializeProviderResources(name: ProviderName): Promise<TranslationProvider> {
  switch (name) {
    case 'deepl': {
      const { initializeTranslator } = await import('./deepl.ts');
      return { id: name, ...(await initializeTranslator()) };
    }
    case 'google': {
      const { initializeTranslator } = await import('./google.ts');
      return { id: 'google-v3', ...(await initializeTranslator()) };
    }
  }
}
