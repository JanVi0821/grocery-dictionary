import { TranslationRuntimeError } from '../providers/errors.ts';

/** 只并发当前批次；首个致命错误停止领取，等待所有在途 worker 后再抛出。 */
export async function runConcurrentBatch<T>(
  rows: T[],
  concurrency: number,
  handle: (row: T, assertActive: () => Promise<void>, worker: number) => Promise<void>,
  shouldStop = () => false,
  assertRunning = async () => {},
) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64)
    throw new Error('concurrency must be between 1 and 64');
  let next = 0;
  let failed = false;
  let fatal: unknown;
  const assertActive = async () => {
    if (failed)
      throw new TranslationRuntimeError('Another translation worker failed; task stopped');
    await assertRunning();
    if (failed)
      throw new TranslationRuntimeError('Another translation worker failed; task stopped');
  };
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, rows.length) }, async (_, index) => {
      while (!failed && !shouldStop() && next < rows.length) {
        const row = rows[next++]; // 无 await 的占位保证同一行只被一个 worker 领取。
        try {
          await assertActive();
          await handle(row, assertActive, index + 1);
        } catch (error) {
          if (!failed) {
            fatal = error;
            failed = true;
          }
          throw error;
        }
      }
    }),
  );
  if (failed) throw fatal;
  return results;
}
