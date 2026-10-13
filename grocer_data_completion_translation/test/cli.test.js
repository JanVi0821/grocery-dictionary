import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTranslationArgs } from '../src/command/args.ts';
import { CONCURRENCY } from '../src/config/translation.ts';

test('CLI defaults to Google and accepts Google or DeepL with a positive limit', () => {
  assert.deepEqual(parseTranslationArgs([]), {
    provider: 'google',
    limit: Infinity,
    concurrency: CONCURRENCY,
  });
  for (const provider of ['google', 'deepl']) {
    assert.deepEqual(parseTranslationArgs(['--provider', provider, '--limit', '2']), {
      provider,
      limit: 2,
      concurrency: CONCURRENCY,
    });
  }
  assert.equal(parseTranslationArgs(['--concurrency', '8']).concurrency, 8);
  for (const value of ['0', '65', '1.5', 'wrong'])
    assert.throws(() => parseTranslationArgs(['--concurrency', value]));
  for (const args of [['--provider'], ['--provider', 'other'], ['--limit', '0']]) {
    assert.throws(() => parseTranslationArgs(args));
  }
});
