import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaiduLlmTranslator } from '../src/providers/baidu-llm.ts';
import { TranslationServiceError } from '../src/providers/errors.ts';
import { parseArgs } from '../src/cli.ts';
import { processRow } from '../src/workflow/row.ts';

const context = { lang: 'zh', source: 'woolworths', path: 'name' };
test('CLI selects baidu-llm while default remains Google', () => {
  assert.equal(parseArgs([]).provider, 'google');
  assert.equal(parseArgs(['--provider', 'baidu-llm', '--limit', '1']).provider, 'baidu-llm');
});
test('LLM sends JSON, Bearer auth and explicit llm model, not MD5 authentication', async () => {
  const translate = createBaiduLlmTranslator('app', 'test-key', {
    intervalMs: 0,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), {
        appid: 'app',
        from: 'en',
        to: 'zh',
        q: 'Milk',
        model_type: 'llm',
      });
      return Response.json({ trans_result: [{ dst: '牛奶' }] });
    },
  });
  let saved;
  await processRow(
    { _id: 'row', source: 'woolworths', detail: { name: 'Milk' } },
    {
      replaceOne: async (_, data) => {
        saved = data;
      },
    },
    { translate, provider: 'baidu-llm' },
  );
  assert.equal(saved.detail.name, '牛奶');
  assert.equal(saved.translation.provider, 'baidu-llm');
});
test('LLM HTML translation keeps llm model without unsupported tag_handling', async () => {
  const translate = createBaiduLlmTranslator('app', 'key', {
    intervalMs: 0,
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model_type, 'llm');
      assert.equal(body.q, 'Milk');
      assert.equal(Object.hasOwn(body, 'tag_handling'), false);
      return Response.json({ trans_result: [{ dst: '牛奶' }] });
    },
  });
  assert.equal(
    await translate('<p class="x">Milk</p>', { ...context, path: 'description' }),
    '<p class="x">牛奶</p>',
  );
});
test('LLM character limit is not byte count; quota and content errors differ', async () => {
  const translate = createBaiduLlmTranslator('app', 'key', {
    intervalMs: 0,
    fetchImpl: async () => Response.json({ trans_result: [{ dst: 'ok' }] }),
  });
  assert.equal(await translate('牛'.repeat(3000), context), 'ok');
  await assert.rejects(translate('x'.repeat(6001), context), /6000 characters/);
  const failing = (code) =>
    createBaiduLlmTranslator('app', 'key', {
      intervalMs: 0,
      fetchImpl: async () => Response.json({ error_code: code }),
    });
  await assert.rejects(failing('59004')('Milk', context), TranslationServiceError);
  await assert.rejects(
    failing('59003')('Milk', context),
    (error) => !(error instanceof TranslationServiceError),
  );
  assert.throws(() => createBaiduLlmTranslator('app', ''), /BAIDU_API_KEY/);
});
