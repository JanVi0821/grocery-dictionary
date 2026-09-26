import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseDocument, DomUtils } from 'htmlparser2';
import render from 'dom-serializer';
import { TranslationServiceError } from './errors.ts';
import { API_REQUEST_INTERVAL_MS } from '../config.ts';
import type { TranslateText } from '../types.ts';

const languages: Record<string, string> = {
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'cht',
  'zh-hant': 'cht',
  en: 'en',
  ja: 'jp',
  ko: 'kor',
  fr: 'fra',
  es: 'spa',
  de: 'de',
  ru: 'ru',
  pt: 'pt',
  it: 'it',
  th: 'th',
  vi: 'vie',
  ar: 'ara',
};

export function createBaiduTranslator(
  appId: string,
  secret: string,
  {
    fetchImpl = fetch,
    intervalMs = API_REQUEST_INTERVAL_MS,
    mode = 'general',
  }: { fetchImpl?: typeof fetch; intervalMs?: number; mode?: 'general' | 'llm' } = {},
): TranslateText {
  if (!appId.trim() || !secret.trim())
    throw new TranslationServiceError('BAIDU_APP_ID and BAIDU_API_KEY are required');
  let lastRequest = 0;
  async function translatePlain(q: string, to: string): Promise<string> {
    if (!q.trim()) return q;
    // Conservative local bound; never truncate a long field silently.
    if (mode === 'llm' ? Array.from(q).length > 6000 : Buffer.byteLength(q, 'utf8') > 6000) {
      throw new Error(
        mode === 'llm'
          ? 'Baidu LLM text exceeds 6000 characters'
          : 'Baidu text exceeds local 6000 UTF-8 byte limit',
      );
    }
    await delay(Math.max(0, intervalMs - (Date.now() - lastRequest)));
    const salt = randomUUID().replaceAll('-', '');
    const sign = createHash('md5')
      .update(appId + q + salt + secret, 'utf8')
      .digest('hex');
    lastRequest = Date.now();
    const response = await fetchImpl(
      mode === 'llm'
        ? 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
        : 'https://fanyi-api.baidu.com/api/trans/vip/translate',
      {
        method: 'POST',
        headers:
          mode === 'llm'
            ? { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }
            : { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:
          mode === 'llm'
            ? JSON.stringify({ q, from: 'en', to, appid: appId, model_type: 'llm' })
            : new URLSearchParams({ q, from: 'en', to, appid: appId, salt, sign }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if ([401, 403, 429].includes(response.status))
      throw new TranslationServiceError(`Baidu service rejected request: HTTP ${response.status}`);
    if (!response.ok) throw new Error(`Baidu HTTP ${response.status}`);
    const data = (await response.json()) as {
      error_code?: string | number;
      trans_result?: { dst?: string }[];
    };
    if (data.error_code && String(data.error_code) !== '52000') {
      const code = String(data.error_code);
      if (['52001', '52002', '59003', '59006', '20003'].includes(code))
        throw new Error(`Baidu translation error ${code}`);
      throw new TranslationServiceError(
        `Baidu service error ${code}; check credentials, balance, rate limits and language configuration`,
      );
    }
    if (
      !Array.isArray(data.trans_result) ||
      !data.trans_result.length ||
      data.trans_result.some((item) => typeof item?.dst !== 'string' || !item.dst.trim())
    ) {
      throw new Error('Baidu returned an empty or invalid translation');
    }
    return data.trans_result.map((item) => item.dst).join('\n');
  }
  return async (text, context) => {
    const to = languages[context.lang.toLowerCase()];
    if (!to)
      throw new TranslationServiceError(
        `Unsupported Baidu target language mapping: ${context.lang}`,
      );
    if (context.path === 'description' && /<[a-z][\s\S]*?>/i.test(text)) {
      // General translation has no HTML MIME mode: preserve tags and attributes.
      const doc = parseDocument(text);
      const parents = [doc, ...DomUtils.findAll(() => true, doc.children)];
      for (const parent of parents) {
        if ('name' in parent && ['script', 'style'].includes(parent.name)) continue;
        for (const child of parent.children) {
          if (child.type === 'text' && child.data.trim())
            child.data = await translatePlain(child.data, to);
        }
      }
      return render(doc, { encodeEntities: 'utf8' });
    }
    return translatePlain(text, to);
  };
}

export function initializeBaiduTranslator(): TranslateText {
  return createBaiduTranslator(
    process.env.BAIDU_APP_ID?.trim() ?? '',
    process.env.BAIDU_API_KEY?.trim() ?? '',
  );
}
