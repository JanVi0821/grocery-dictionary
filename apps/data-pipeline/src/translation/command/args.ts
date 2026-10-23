import type { ProviderName } from '../providers/initialize-provider.ts';
import { CONCURRENCY } from '../config/translation.ts';

/**
 * 三个命令共用的参数：--provider 选择真实 API，默认 Google（统一 CLI 显式指定 DeepL）；
 * --limit 为本次最多处理的行数，成功、数据失败及重试时缺失源记录均计数；不传则不限。
 * --limit 不改变每批最多 100 条的读取方式，也不保存跨次执行的进度。
 * --concurrency 为单进程异步 worker 数（1–64），默认取 config.CONCURRENCY。
 */
export function parseTranslationArgs(args: string[]) {
  let provider: ProviderName = 'google';
  let limit = Infinity;
  let concurrency = CONCURRENCY;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      limit = Number(args[++i]);
      if (!Number.isSafeInteger(limit) || limit < 1)
        throw new Error('--limit must be a positive integer');
    } else if (args[i] === '--concurrency') {
      concurrency = Number(args[++i]);
      if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64)
        throw new Error('--concurrency must be an integer between 1 and 64');
    } else if (args[i] === '--provider') {
      const value = args[++i];
      if (value !== 'google' && value !== 'deepl')
        throw new Error('--provider must be google or deepl');
      provider = value;
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return { provider, limit, concurrency };
}
