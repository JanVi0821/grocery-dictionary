import { setTimeout as delay } from 'node:timers/promises';
import { API_REQUEST_INTERVAL_MS } from '../config.ts';
import type { TranslateText } from '../types.ts';

let lastRequestStartedAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

/** Space actual translation calls across this process, including retries. */
export function withRequestRateLimit(
  translate: TranslateText,
  intervalMs = API_REQUEST_INTERVAL_MS,
): TranslateText {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('API_REQUEST_INTERVAL_MS must be a non-negative number');
  }
  return async (text, context) => {
    const previous = requestQueue;
    let release!: () => void;
    requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const remaining = intervalMs - (Date.now() - lastRequestStartedAt);
      if (remaining > 0) await delay(remaining);
      lastRequestStartedAt = Date.now();
      return await translate(text, context);
    } finally {
      release();
    }
  };
}
