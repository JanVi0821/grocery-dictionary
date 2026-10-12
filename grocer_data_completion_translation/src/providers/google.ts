import { v3 } from '@google-cloud/translate';
import type { TranslateText, Translator } from '../types/translation.ts';

import { TranslationServiceError } from './errors.ts';
import { withRequestRateLimit } from './rate-limit.ts';

type Request = {
  parent: string;
  contents: string[];
  sourceLanguageCode: string;
  targetLanguageCode: string;
  mimeType: string;
};
type Send = (request: Request) => Promise<string | null | undefined>;

/** 根据已提供的请求方法创建翻译函数；不初始化认证或 SDK 资源，可用于离线测试。 */
export function createGoogleTranslationFunction(projectId: string, send: Send): TranslateText {
  if (!projectId.trim()) throw new TranslationServiceError('GOOGLE_CLOUD_PROJECT missing');
  const request = withRequestRateLimit(send);
  return async (text, context) => {
    if (!text.trim()) return text;
    const mimeType =
      context.path === 'description' && /<[a-z][\s\S]*?>/i.test(text) ? 'text/html' : 'text/plain';
    try {
      const result = await request({
        parent: `projects/${projectId}/locations/global`,
        contents: [text],
        sourceLanguageCode: 'en',
        targetLanguageCode: context.lang,
        mimeType,
      });
      if (!result?.trim()) throw new Error(`Empty Google translation: ${context.path}`);
      return result;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? Number(error.code) : undefined;
      // Do not consume the entire source queue on auth, billing or quota failures.
      if ([7, 8, 16, 401, 403, 429].includes(code ?? 0)) {
        throw new TranslationServiceError(
          `Google authentication/permission/quota error (code ${code}); check credentials, billing and API quotas`,
        );
      }
      throw error;
    }
  };
}

/** 初始化认证和独立 SDK 实例；失败时释放资源，成功时返回统一的生命周期接口。 */
export async function initializeTranslator({
  projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim(),
  createClient = () => new v3.TranslationServiceClient(),
}: {
  projectId?: string;
  createClient?: () => Pick<v3.TranslationServiceClient, 'auth' | 'translateText' | 'close'>;
} = {}): Promise<Translator> {
  if (!projectId?.trim()) throw new TranslationServiceError('GOOGLE_CLOUD_PROJECT missing');
  const client = createClient();
  // Resolve ADC before fetching products; never print private keys or tokens.
  try {
    await client.auth.getClient();
  } catch {
    await client.close();
    throw new TranslationServiceError(
      'Unable to load Google ADC credentials; check GOOGLE_APPLICATION_CREDENTIALS',
    );
  }
  const translate = createGoogleTranslationFunction(projectId, async (request) => {
    const [response] = await client.translateText(request, { timeout: 30_000, retry: null });
    return response.translations?.[0]?.translatedText;
  });
  return {
    translate,
    close: async () => {
      await client.close();
    },
  };
}
