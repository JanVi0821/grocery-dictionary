import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeeplTranslator } from '../src/providers/deepl.ts';
import { TranslationServiceError } from '../src/providers/errors.ts';
import { parseArgs } from '../src/cli.ts';
import { processRow } from '../src/workflow/row.ts';

const context = { lang: 'zh', source: 'woolworths', path: 'name' };
test('DeepL CLI and Free/Pro endpoints with exact auth and JSON request', async () => {
  assert.equal(parseArgs(['--provider', 'deepl']).provider, 'deepl');
  assert.equal(parseArgs([]).provider, 'google');
  for (const [key, host] of [
    ['test:fx', 'api-free.deepl.com'],
    ['test', 'api.deepl.com'],
  ]) {
    const translate = createDeeplTranslator(key, {
      fetchImpl: async (url, options) => {
        assert.equal(url, `https://${host}/v2/translate`);
        assert.equal(options.headers.Authorization, `DeepL-Auth-Key ${key}`);
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), {
          text: ['Milk'],
          source_lang: 'EN',
          target_lang: 'ZH-HANS',
          preserve_formatting: true,
        });
        return Response.json({ translations: [{ text: '牛奶' }] });
      },
    });
    assert.equal(await translate('Milk', context), '牛奶');
  }
});
test('DeepL HTML and traditional Chinese mapping', async () => {
  const translate = createDeeplTranslator('test', {
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.tag_handling, 'html');
      assert.equal(body.target_lang, 'ZH-HANT');
      return Response.json({ translations: [{ text: '<p>牛奶</p>' }] });
    },
  });
  assert.equal(
    await translate('<p>Milk</p>', { ...context, path: 'description', lang: 'zh-TW' }),
    '<p>牛奶</p>',
  );
});
test('DeepL validates key, response and request size without leaking credentials', async () => {
  assert.throws(() => createDeeplTranslator(' '), /DEEPL_API_KEY/);
  const translate = createDeeplTranslator('test', {
    fetchImpl: async () => Response.json({ translations: [] }),
  });
  assert.equal(await translate(' ', context), ' ');
  await assert.rejects(translate('Milk', context), /invalid translation/);
  await assert.rejects(translate('x'.repeat(128 * 1024), context), /128 KiB/);
});
test('DeepL auth/rate/quota failures stop, server failures remain row failures', async () => {
  for (const status of [401, 403, 429, 456, 500]) {
    const translate = createDeeplTranslator('test', {
      fetchImpl: async () => new Response('', { status }),
    });
    await assert.rejects(
      translate('Milk', context),
      (error) => error instanceof TranslationServiceError === (status !== 500),
    );
  }
});
test('DeepL row stores provider metadata and keeps excluded fields', async () => {
  const translate = createDeeplTranslator('test', {
    fetchImpl: async () => Response.json({ translations: [{ text: '牛奶' }] }),
  });
  let saved;
  await processRow(
    {
      _id: 'row',
      source: 'woolworths',
      brand: 'Anchor',
      detail: { name: 'Milk', productDisclaimerMessage: 'Original' },
    },
    {
      replaceOne: async (_, doc) => {
        saved = doc;
      },
    },
    { translate, provider: 'deepl' },
  );
  assert.equal(saved.translation.provider, 'deepl');
  assert.equal(saved.brand, 'Anchor');
  assert.equal(saved.detail.productDisclaimerMessage, 'Original');
});
