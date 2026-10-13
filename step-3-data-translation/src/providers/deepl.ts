import type { TranslateText, Translator } from '../types/translation.ts';
import { TranslationServiceError } from './errors.ts';
import { buildDeeplGuidance } from './deepl-context.ts';
import { createDeeplKeyPool, type DeepLKeyPool } from './deepl-api-keys/deepl-key-pool.ts';
import { withRequestRateLimit } from './rate-limit.ts';

/** 根据已有 key/pool 创建 REST 翻译函数；不负责从文件初始化 pool，可注入 fetch 离线测试。 */
export function createDeeplTranslationFunction(
  key: string | DeepLKeyPool,
  { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): TranslateText {
  // 字符串参数仅供离线测试；CLI 始终从本地 key pool 初始化。
  if (typeof key === 'string' && !key.trim())
    throw new TranslationServiceError('DeepL API key missing');
  // 限速实际 HTTP 请求，包含同一字段因 456 轮换 key 后发起的请求。
  const request = withRequestRateLimit(fetchImpl);

  return async (text, context) => {
    if (!text.trim()) return text;
    const language = context.lang.replaceAll('_', '-').toUpperCase();
    const aliases: Record<string, string> = {
      ZH: 'ZH-HANS',
      'ZH-CN': 'ZH-HANS',
      'ZH-TW': 'ZH-HANT',
    };
    const isHtml = context.path === 'description' && /<[a-z][\s\S]*?>/i.test(text);
    const targetLanguage = aliases[language] ?? language;
    const body = JSON.stringify({
      text: [text],
      source_lang: 'EN',
      target_lang: targetLanguage,
      ...buildDeeplGuidance(context, targetLanguage),
      preserve_formatting: true,
      ...(isHtml ? { tag_handling: 'html' } : {}),
    });
    if (Buffer.byteLength(body, 'utf8') > 128 * 1024) {
      throw new Error('DeepL request exceeds 128 KiB; text was not truncated');
    }
    for (;;) {
      const apiKey = typeof key === 'string' ? key.trim() : key.current();
      const endpoint = apiKey.endsWith(':fx')
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate';
      const response = await request(endpoint, {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 456 && typeof key !== 'string') {
        await key.exhaust(apiKey);
        continue; // 同一字段用下一把 key 继续，不消耗普通失败重试次数。
      }
      if ([401, 403, 429, 456].includes(response.status)) {
        throw new TranslationServiceError(
          `DeepL service error HTTP ${response.status}; check API key, rate limits and quota`,
        );
      }
      if (!response.ok) throw new Error(`DeepL HTTP ${response.status}`);
      const data = (await response.json()) as { translations?: { text?: string }[] } | null;
      const results = data?.translations;
      if (
        !Array.isArray(results) ||
        results.length !== 1 ||
        typeof results[0]?.text !== 'string' ||
        !results[0].text.trim()
      ) {
        throw new Error('DeepL returned an empty or invalid translation');
      }
      return results[0].text;
    }
  };
}

/** 初始化本地 key pool，返回与 Google 一致的生命周期接口；HTTP 无需额外释放资源。 */
export async function initializeTranslator({
  keyFile,
  fetchImpl = fetch,
  assertRunning = async () => {},
}: {
  keyFile?: URL;
  fetchImpl?: typeof fetch;
  assertRunning?: () => Promise<void>;
} = {}): Promise<Translator> {
  const pool = await createDeeplKeyPool(keyFile, assertRunning);
  return { translate: createDeeplTranslationFunction(pool, { fetchImpl }), close: async () => {} };
}
