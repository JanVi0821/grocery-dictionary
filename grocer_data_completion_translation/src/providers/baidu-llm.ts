import { createBaiduTranslator } from './baidu.ts';
import type { TranslateText } from '../types.ts';

/** AI Text Translate: JSON + Bearer API Key, explicitly model_type=llm.
 * https://fanyi-api.baidu.com/doc/21
 * Reuse language mapping, pacing, response validation and local HTML preservation.
 */
export function createBaiduLlmTranslator(
  appId: string,
  apiKey: string,
  options: {
    fetchImpl?: typeof fetch;
    intervalMs?: number;
  } = {},
): TranslateText {
  return createBaiduTranslator(appId, apiKey, { ...options, mode: 'llm' });
}

export function initializeBaiduLlmTranslator(): TranslateText {
  return createBaiduLlmTranslator(
    process.env.BAIDU_APP_ID?.trim() ?? '',
    process.env.BAIDU_LLM_API_KEY?.trim() ?? '',
  );
}
