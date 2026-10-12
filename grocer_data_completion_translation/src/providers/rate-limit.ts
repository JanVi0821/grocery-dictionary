import { setTimeout as delay } from 'node:timers/promises';
import { API_REQUEST_INTERVAL_MS } from '../config/translation.ts';

let lastRequestStartedAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

/** Space actual translation calls across this process, including retries. */
export function withRequestRateLimit<Args extends unknown[], Result>(
  request: (...args: Args) => Promise<Result>,
  intervalMs = API_REQUEST_INTERVAL_MS,
): (...args: Args) => Promise<Result> {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('API_REQUEST_INTERVAL_MS must be a non-negative number');
  }
  return async (...args) => {
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
      return await request(...args);
    } finally {
      release();
    }
  };
}
