import type { TranslateText } from '../types.ts';
import { TranslationServiceError } from './errors.ts';

/** DeepL REST API; injectable fetch keeps tests offline. */
export function createDeeplTranslator(
  key: string,
  { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): TranslateText {
  const apiKey = key.trim();
  if (!apiKey) throw new TranslationServiceError('DEEPL_API_KEY missing');
  const endpoint = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  return async (text, context) => {
    if (!text.trim()) return text;
    const language = context.lang.replaceAll('_', '-').toUpperCase();
    const aliases: Record<string, string> = {
      ZH: 'ZH-HANS',
      'ZH-CN': 'ZH-HANS',
      'ZH-TW': 'ZH-HANT',
    };
    const isHtml = context.path === 'description' && /<[a-z][\s\S]*?>/i.test(text);
    const body = JSON.stringify({
      text: [text],
      source_lang: 'EN',
      target_lang: aliases[language] ?? language,
      preserve_formatting: true,
      ...(isHtml ? { tag_handling: 'html' } : {}),
    });
    if (Buffer.byteLength(body, 'utf8') > 128 * 1024) {
      throw new Error('DeepL request exceeds 128 KiB; text was not truncated');
    }
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    // Stop the job on authentication, rate limit or exhausted account quota.
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
  };
}

export function initializeDeeplTranslator(): TranslateText {
  return createDeeplTranslator(process.env.DEEPL_API_KEY ?? '');
}
