import { setTimeout as delay } from 'node:timers/promises';
import type { TranslateText } from '../types.ts';
import { TranslationServiceError } from './errors.ts';

const RETRY_DELAYS_MS = [4000, 8000, 8000, 16000];

/** Keep diagnostics JSON-serializable without dumping request/response objects. */
function describeError(error: unknown, depth = 0): Record<string, unknown> {
  const redact = (value: string) => {
    for (const [key, secret] of Object.entries(process.env)) {
      if (secret && /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)) {
        value = value.split(secret).join('[REDACTED]');
      }
    }
    return value.replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]');
  };
  const details =
    error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const result: Record<string, unknown> = {
    name: typeof details?.name === 'string' ? redact(details.name) : 'Error',
    message: redact(
      typeof details?.message === 'string'
        ? details.message
        : details
          ? 'Unknown error'
          : String(error),
    ),
  };
  for (const key of ['code', 'status', 'statusCode']) {
    const value = details?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      result[key] = typeof value === 'string' ? redact(value) : value;
    }
  }
  if (details?.cause !== undefined && depth < 2)
    result.cause = describeError(details.cause, depth + 1);
  return result;
}

/** Retry the current field only, using the configured backoff schedule. */
export function withTranslationRetry(
  translate: TranslateText,
  provider: string,
  {
    sleep = (ms: number) => delay(ms),
    log = (event: unknown) => console.error(JSON.stringify(event)),
  }: { sleep?: (ms: number) => Promise<unknown>; log?: (event: unknown) => void } = {},
): TranslateText {
  return async (text, context) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await translate(text, context);
        if (text.trim() && (typeof result !== 'string' || !result.trim())) {
          throw new Error('Empty translation response');
        }
        return result;
      } catch (err) {
        const error = describeError(err);
        const delayMs = RETRY_DELAYS_MS[attempt];
        if (delayMs === undefined) {
          // Fatal to row processing: never persist a failed row and advance past it.
          throw new TranslationServiceError(
            `${provider}: translation failed after ${RETRY_DELAYS_MS.length} retries (${RETRY_DELAYS_MS.length + 1} attempts), source=${context.source}, field=${context.path}, error=${JSON.stringify(error)}`,
          );
        }
        // Serialize diagnostic fields only, not raw request/response objects.
        log({
          event: 'translation_retry',
          provider,
          source: context.source,
          field: context.path,
          retry: attempt + 1,
          maxRetries: RETRY_DELAYS_MS.length,
          delayMs,
          error,
        });
        await sleep(delayMs);
      }
    }
  };
}
