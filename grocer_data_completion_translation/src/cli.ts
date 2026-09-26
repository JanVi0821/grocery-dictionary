import type { ProviderName } from './providers/select.ts';

export function parseArgs(args: string[]) {
  let provider: ProviderName = 'google';
  let dryRun = false;
  let limit = Infinity;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--limit') {
      limit = Number(args[++i]);
      if (!Number.isSafeInteger(limit) || limit < 1)
        throw new Error('--limit must be a positive integer');
    } else if (args[i] === '--provider') {
      const value = args[++i];
      if (value !== 'google' && value !== 'baidu' && value !== 'baidu-llm' && value !== 'deepl')
        throw new Error('--provider must be google, baidu, baidu-llm or deepl');
      provider = value;
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return { provider, dryRun, limit };
}
