import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/command/args.ts';

test('CLI defaults to Google and accepts Google or DeepL with a positive limit', () => {
  assert.deepEqual(parseArgs([]), { provider: 'google', limit: Infinity });
  for (const provider of ['google', 'deepl']) {
    assert.deepEqual(parseArgs(['--provider', provider, '--limit', '2']), { provider, limit: 2 });
  }
  for (const args of [['--provider'], ['--provider', 'other'], ['--limit', '0']]) {
    assert.throws(() => parseArgs(args));
  }
});
