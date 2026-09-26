import test from 'node:test';
import assert from 'node:assert/strict';
import { withShortTextCache } from '../src/providers/cache.ts';
import { translateRow } from '../src/workflow/row.ts';

const context = { lang: 'zh', source: 'new-world', path: 'name' };

test('cache hit logs distinguish row and global hits without logging misses', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(JSON.parse(line)));
  let requests = 0;
  const translate = withShortTextCache(async () => {
    requests++;
    return '牛奶';
  });
  const row = {
    productId: 1543,
    source: 'new-world',
    product_name: 'Milk',
    detail: { name: 'Milk' },
  };
  await translateRow(row, translate);
  await translateRow(row, translate);
  assert.equal(requests, 1);
  assert.deepEqual(
    logs.map(({ cache, field }) => [cache, field]),
    [
      ['row', 'name'],
      ['global', 'row.product_name'],
      ['row', 'name'],
    ],
  );
  for (const entry of logs) {
    assert.equal(entry.event, 'translation_cache_hit');
    assert.equal(entry.text, 'Milk');
    assert.equal(entry.source, 'new-world');
    assert.equal(entry.lang, 'zh');
  }
  assert.equal(logs[0].productId, 1543);
});

test('short text is shared across rows; long text keeps row-local caching only', async () => {
  const calls = [];
  const translate = withShortTextCache(async (text) => {
    calls.push(text);
    return `译:${text}`;
  });
  const long = 'x'.repeat(31);
  const row = {
    source: 'new-world',
    product_name: 'Milk',
    detail: {
      name: 'Milk',
      ingredientStatement: long,
      fsIngredientStatement: long,
    },
  };
  for (let i = 0; i < 2; i++) {
    const out = await translateRow(row, translate);
    assert.equal(out.detail.name, '译:Milk');
    assert.equal(out.detail.fsIngredientStatement, `译:${long}`);
    assert.equal(out.translation.fieldCount, 4);
  }
  assert.deepEqual(calls, ['Milk', long, long]);
});

test('cache ignores text case, preserves whitespace, and isolates language and translator', async () => {
  let calls = 0;
  const request = async () => String(++calls);
  const translate = withShortTextCache(request);
  assert.equal(await translate('Milk', context), '1');
  assert.equal(await translate('Milk', context), '1');
  assert.equal(await translate('milk', context), '1');
  assert.equal(await translate('MILK', context), '1');
  assert.deepEqual(translate.snapshot('zh'), { milk: '1' });
  await translate(' Milk ', context);
  await translate('Milk', { ...context, lang: 'ja' });
  await withShortTextCache(request)('Milk', context);
  assert.equal(calls, 4);
});

test('threshold counts Unicode characters, includes boundary, and can be disabled', async () => {
  for (const [text, max, expected] of [
    ['😀'.repeat(30), 30, 1],
    ['x'.repeat(31), 30, 2],
    ['Milk', 0, 2],
  ]) {
    let calls = 0;
    const translate = withShortTextCache(async () => {
      calls++;
      return '译';
    }, max);
    await translate(text, context);
    await translate(text, context);
    assert.equal(calls, expected);
  }
});

test('failed and empty translations are never cached', async () => {
  let calls = 0;
  const translate = withShortTextCache(async () => {
    calls++;
    if (calls === 1) throw new Error('offline');
    return calls === 2 ? '' : '牛奶';
  });
  await assert.rejects(translate('Milk', context), /offline/);
  assert.equal(await translate('Milk', context), '');
  assert.equal(await translate('Milk', context), '牛奶');
  assert.equal(await translate('Milk', context), '牛奶');
  assert.equal(calls, 3);
});
