import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBaiduTranslator } from '../src/providers/baidu.ts';
import { TranslationServiceError } from '../src/providers/errors.ts';
import { parseArgs } from '../src/cli.ts';
import { processRow } from '../src/workflow/row.ts';

const context = { lang: 'zh', source: 'new-world', path: 'name' };
test('CLI defaults to Google and validates provider and limit', () => {
  assert.deepEqual(parseArgs([]), { provider: 'google', limit: Infinity, dryRun: false });
  assert.deepEqual(parseArgs(['--provider', 'baidu', '--limit', '2', '--dry-run']), {
    provider: 'baidu',
    limit: 2,
    dryRun: true,
  });
  for (const args of [['--provider'], ['--provider', 'other'], ['--limit', '0']])
    assert.throws(() => parseArgs(args));
});
test('Baidu signs raw Unicode before form encoding and merges all translated segments', async () => {
  const translate = createBaiduTranslator('app', 'secret', {
    intervalMs: 0,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fanyi-api.baidu.com/api/trans/vip/translate');
      assert.equal(options.method, 'POST');
      const body = options.body;
      assert.equal(body.get('q'), 'Milk & 牛奶\nCream');
      assert.equal(body.get('to'), 'jp');
      assert.equal(
        body.get('sign'),
        createHash('md5')
          .update('app' + body.get('q') + body.get('salt') + 'secret')
          .digest('hex'),
      );
      return Response.json({ trans_result: [{ dst: '牛奶' }, { dst: '奶油' }] });
    },
  });
  assert.equal(await translate('Milk & 牛奶\nCream', { ...context, lang: 'ja' }), '牛奶\n奶油');
});
test('Baidu preserves HTML markup and attributes, translates text only', async () => {
  const inputs = [];
  const translate = createBaiduTranslator('app', 'secret', {
    intervalMs: 0,
    fetchImpl: async (_, options) => {
      inputs.push(options.body.get('q'));
      return Response.json({ trans_result: [{ dst: '牛奶 & 奶油' }] });
    },
  });
  const result = await translate('<p class="x">Milk &amp; Cream</p><script>keep()</script>', {
    ...context,
    path: 'description',
  });
  assert.deepEqual(inputs, ['Milk & Cream']);
  assert.equal(result, '<p class="x">牛奶 &amp; 奶油</p><script>keep()</script>');
});
test('Baidu service errors stop the job; empty responses fail a row', async () => {
  const translate = createBaiduTranslator('app', 'secret', {
    intervalMs: 0,
    fetchImpl: async () => Response.json({ error_code: '54004' }),
  });
  await assert.rejects(translate('Milk', context), TranslationServiceError);
  const empty = createBaiduTranslator('app', 'secret', {
    intervalMs: 0,
    fetchImpl: async () => Response.json({ trans_result: [] }),
  });
  await assert.rejects(empty('Milk', context), /empty or invalid/);
  await assert.rejects(empty('x'.repeat(6001), context), /6000/);
  assert.throws(() => createBaiduTranslator('', ''), /required/);
});
test('Baidu metadata is used for both success and failure without Google authentication', async () => {
  const row = { _id: 'test', source: 'new-world', detail: { name: 'Milk' } };
  let saved;
  const target = {
    replaceOne: async (_, doc) => {
      saved = doc;
    },
  };
  await processRow(row, target, { provider: 'baidu', translate: async () => '牛奶' });
  assert.equal(saved.translation.provider, 'baidu');
  assert.equal(saved.translation.status, 'completed');
  await processRow(row, target, {
    provider: 'baidu',
    translate: async () => {
      throw new Error('timeout');
    },
  });
  assert.equal(saved.translation.provider, 'baidu');
  assert.equal(saved.translation.status, 'failed');
});
