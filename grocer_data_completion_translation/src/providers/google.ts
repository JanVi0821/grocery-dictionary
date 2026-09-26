import { v3 } from '@google-cloud/translate';
import type { TranslateText } from '../types.ts';

import { TranslationServiceError } from './errors.ts';

type Request = {
  parent: string;
  contents: string[];
  sourceLanguageCode: string;
  targetLanguageCode: string;
  mimeType: string;
};
type Send = (request: Request) => Promise<string | null | undefined>;

/** Injectable transport keeps tests offline; production uses the official v3 SDK. */
export function createGoogleTranslator(projectId: string, send: Send): TranslateText {
  if (!projectId.trim()) throw new TranslationServiceError('GOOGLE_CLOUD_PROJECT missing');
  return async (text, context) => {
    if (!text.trim()) return text;
    const mimeType =
      context.path === 'description' && /<[a-z][\s\S]*?>/i.test(text) ? 'text/html' : 'text/plain';
    try {
      const result = await send({
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

let client: v3.TranslationServiceClient | undefined;
let translator: TranslateText | undefined;

export async function initializeTranslator(): Promise<void> {
  if (translator) return;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!projectId) throw new TranslationServiceError('GOOGLE_CLOUD_PROJECT missing');
  client = new v3.TranslationServiceClient();
  // Resolve ADC before fetching products; never print private keys or tokens.
  try {
    await client.auth.getClient();
  } catch {
    throw new TranslationServiceError(
      'Unable to load Google ADC credentials; check GOOGLE_APPLICATION_CREDENTIALS',
    );
  }
  translator = createGoogleTranslator(projectId, async (request) => {
    const [response] = await client!.translateText(request, { timeout: 30_000, retry: null });
    return response.translations?.[0]?.translatedText;
  });
}

export const translateText: TranslateText = async (text, context) => {
  await initializeTranslator();
  return translator!(text, context);
};

export async function closeTranslator(): Promise<void> {
  await client?.close();
  client = undefined;
  translator = undefined;
}
