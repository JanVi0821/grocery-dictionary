import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeeplTranslationFunction } from '../../apps/data-pipeline/src/translation/providers/deepl.ts';
import { TranslationServiceError } from '../../apps/data-pipeline/src/translation/providers/errors.ts';
import { parseTranslationArgs } from '../../apps/data-pipeline/src/translation/command/args.ts';
import { processRow } from '../../apps/data-pipeline/src/translation/workflow/row.ts';

const context = { lang: 'zh', source: 'woolworths', path: 'name' };
test('DeepL CLI and Free/Pro endpoints with exact auth and JSON request', async () => {
  assert.equal(parseTranslationArgs(['--provider', 'deepl']).provider, 'deepl');
  assert.equal(parseTranslationArgs([]).provider, 'google');
  for (const [key, host] of [
    ['test:fx', 'api-free.deepl.com'],
    ['test', 'api.deepl.com'],
  ]) {
    const translate = createDeeplTranslationFunction(key, {
      fetchImpl: async (url, options) => {
        assert.equal(url, `https://${host}/v2/translate`);
        assert.equal(options.headers.Authorization, `DeepL-Auth-Key ${key}`);
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        const { context: background, custom_instructions: instructions, ...base } = body;
        assert.deepEqual(base, {
          text: ['Milk'],
          source_lang: 'EN',
          target_lang: 'ZH-HANS',
          preserve_formatting: true,
        });
        assert.match(background, /New Zealand/);
        assert.match(background, /supermarket product listing/);
        assert.ok(instructions.length <= 10);
        assert.ok(instructions.every((instruction) => instruction.length <= 300));
        assert.ok(instructions.some((instruction) => instruction.includes('Simplified Chinese')));
        return Response.json({ translations: [{ text: '牛奶' }] });
      },
    });
    assert.equal(await translate('Milk', context), '牛奶');
  }
});
test('DeepL receives original product context for every field and excludes unrelated metadata', async () => {
  const row = {
    _id: 'row',
    productId: 123,
    source: 'paknsave',
    product_name: 'Original milk',
    brand: 'Original brand',
    attempts: ['private request metadata'],
    detail: {
      name: 'Anchor Blue Milk',
      brand: 'Anchor',
      categoryTrees: [{ level0: 'Fresh Foods', level1: 'Dairy', level2: 'Milk' }],
      netContent: 2,
      netContentUOM: 'L',
      description: '<p>Fresh milk &amp; dairy.</p>',
      allergenStatement: 'Contains milk. May contain soy.',
      nutritionalInfo: { nutrients: [{ nutrientTypeDescription: 'Calories', qtyContained: 100 }] },
    },
  };
  const requests = [];
  const translate = createDeeplTranslationFunction('test', {
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({ translations: [{ text: '译文' }] });
    },
  });
  await processRow(row, { replaceOne: async () => {} }, { translate, provider: 'deepl' });
  for (const request of requests) {
    assert.match(request.context, /Product name: Anchor Blue Milk/);
    assert.match(request.context, /Brand: Anchor/);
    assert.match(request.context, /Product description: Fresh milk & dairy\./);
    assert.doesNotMatch(
      request.context,
      /译文|private request metadata|productId|<p>|Calories|Categories|Pack size/,
    );
    assert.ok(request.custom_instructions.every((instruction) => instruction.length <= 300));
  }
  assert.ok(
    requests[0].custom_instructions.some((instruction) =>
      instruction.includes('Keep brand names in product names exactly as written'),
    ),
  );
  assert.equal(row.detail.name, 'Anchor Blue Milk');
});

test('DeepL bounds optional background and omits instructions for unsupported target languages', async () => {
  const translate = createDeeplTranslationFunction('test', {
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.custom_instructions, undefined);
      assert.equal(body.target_lang, 'RU');
      assert.match(body.context, /Product name: Kumara/);
      const description = body.context.split('Product description: ')[1];
      assert.equal(Array.from(description).length, 1000);
      return Response.json({ translations: [{ text: 'перевод' }] });
    },
  });
  await translate('Kumara', {
    ...context,
    lang: 'ru',
    product: {
      source: 'woolworths',
      detail: {
        name: 'Kumara',
        breadcrumb: {
          department: { name: 'Food' },
          aisle: { name: 'Vegetables' },
          shelf: { name: 'Roots' },
        },
        size: { volumeSize: '1 kg' },
        description: 'A'.repeat(2000),
      },
    },
  });
});
test('DeepL brand context falls back to the original outer brand for every source', async () => {
  for (const source of ['new-world', 'paknsave', 'woolworths']) {
    const translate = createDeeplTranslationFunction('test', {
      fetchImpl: async (_, options) => {
        const body = JSON.parse(options.body);
        assert.match(body.context, /Brand: Anchor/);
        assert.match(body.context, /Product name: Anchor Milk/);
        assert.doesNotMatch(body.context, /undefined|null/);
        return Response.json({ translations: [{ text: 'Anchor 牛奶' }] });
      },
    });
    assert.equal(
      await translate('Anchor Milk', {
        ...context,
        source,
        product: {
          source,
          product_name: 'Anchor Milk',
          brand: 'Anchor',
          detail: { name: ' ', brand: '' },
        },
      }),
      'Anchor 牛奶',
    );
  }
});
test('DeepL HTML and traditional Chinese mapping', async () => {
  const translate = createDeeplTranslationFunction('test', {
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
  assert.throws(() => createDeeplTranslationFunction(' '), /DeepL API key/);
  const translate = createDeeplTranslationFunction('test', {
    fetchImpl: async () => Response.json({ translations: [] }),
  });
  assert.equal(await translate(' ', context), ' ');
  await assert.rejects(translate('Milk', context), /invalid translation/);
  await assert.rejects(translate('x'.repeat(128 * 1024), context), /128 KiB/);
});
test('DeepL auth/rate/quota failures stop, server failures remain row failures', async () => {
  for (const status of [401, 403, 429, 456, 500]) {
    const translate = createDeeplTranslationFunction('test', {
      fetchImpl: async () => new Response('', { status }),
    });
    await assert.rejects(
      translate('Milk', context),
      (error) => error instanceof TranslationServiceError === (status !== 500),
    );
  }
});
test('DeepL row stores provider metadata and keeps excluded fields', async () => {
  const translate = createDeeplTranslationFunction('test', {
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
