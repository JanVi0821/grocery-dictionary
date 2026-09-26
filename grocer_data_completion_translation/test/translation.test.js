import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { processRow, translateRow } from '../src/workflow/row.ts';
import { runTranslation } from '../src/workflow/runner.ts';

const fixture = (source = 'new-world') => ({
  _id: new ObjectId(),
  productId: 12,
  source,
  needsReview: false,
  query: '123456',
  product_name: 'Original Milk',
  brand: 'Original',
  attempts: ['old crawl attempt'],
  detail: {
    name: 'Milk',
    brand: 'Anchor',
    price: 4.5,
    sku: '123',
    ingredientStatement: 'Milk',
    fsIngredientStatement: '**Milk**',
    categories: ['Dairy'],
    description: null,
  },
});
const translated = async (text) => `中文:${text}`;
test('identical field text is cached within a row, but never across rows', async () => {
  const row = fixture();
  row.product_name = 'Milk';
  row.detail.categories = ['Milk', 'milk', ' Milk '];
  row.detail.fsIngredientStatement = 'MILK';
  const calls = [];
  const translate = async (text) => {
    calls.push(text);
    return `译文:${text}`;
  };
  const out = await translateRow(row, translate);
  assert.deepEqual(calls, ['Milk', ' Milk ']);
  assert.equal(out.product_name, '译文:Milk');
  assert.equal(out.detail.name, '译文:Milk');
  assert.equal(out.detail.ingredientStatement, '译文:Milk');
  assert.equal(out.detail.fsIngredientStatement, '译文:Milk');
  assert.deepEqual(out.detail.categories, ['译文:Milk', '译文:Milk', '译文: Milk ']);
  assert.equal(out.translation.fieldCount, 7);
  await translateRow(row, translate);
  assert.deepEqual(calls, ['Milk', ' Milk ', 'Milk', ' Milk ']);
  assert.equal(row.detail.name, 'Milk');
});

test('an aborted row does not retain previously cached translations', async () => {
  const row = fixture();
  const calls = [];
  const translate = async (text) => {
    calls.push(text);
    if (text === 'Milk') throw new Error('request failed');
    return translated(text);
  };
  await assert.rejects(translateRow(row, translate), /request failed/);
  await assert.rejects(translateRow(row, translate), /request failed/);
  assert.deepEqual(calls, ['Original Milk', 'Milk', 'Original Milk', 'Milk']);
});

function memoryTarget() {
  let stored;
  let writes = 0;
  return {
    findOne: async () => stored,
    replaceOne: async (_, row) => {
      writes++;
      stored = row;
    },
    get stored() {
      return stored;
    },
    get writes() {
      return writes;
    },
  };
}
for (const source of ['new-world', 'paknsave']) {
  test(`${source}: whitelist translates text and preserves source and identifiers`, async () => {
    const row = fixture(source);
    const out = await translateRow(row, translated);
    assert.equal(out.detail.name, '中文:Milk');
    assert.equal(out.product_name, '中文:Original Milk');
    assert.equal(out.brand, 'Original');
    assert.equal(row.product_name, 'Original Milk');
    assert.equal(row.brand, 'Original');
    assert.equal(out.detail.fsIngredientStatement, '中文:**Milk**');
    assert.deepEqual(out.detail.categories, ['中文:Dairy']);
    assert.equal(out.detail.brand, 'Anchor');
    assert.equal(out.detail.price, 4.5);
    assert.equal(out.detail.sku, '123');
    assert.equal(out.detail.description, null);
    assert.equal(out.query, row.query);
    assert.equal(out._id, row._id);
    assert.equal(Object.hasOwn(out, 'attempts'), false);
    assert.equal(row.detail.name, 'Milk');
  });
}
test('Woolworths nested nutrition preserves measurements and nullable tables', async () => {
  const row = fixture('woolworths');
  row.detail.nutrition = [
    null,
    {
      columnHeaders: [{ name: 'Per serving', suffix: 'g' }],
      servings: '2 servings',
      footnotes: [{ displayText: 'Approximate', prefix: '*' }],
      rows: [
        { columns: ['Fat', '2g', null], rows: [{ columns: ['Saturated', '< 1g'], rows: null }] },
      ],
    },
  ];
  row.detail.ingredients = { ingredients: ['Milk'], footnotes: null };
  const out = await translateRow(row, translated);
  assert.deepEqual(out.detail.nutrition[1].rows[0].columns, ['中文:Fat', '2g', null]);
  assert.equal(out.detail.nutrition[1].rows[0].rows[0].columns[0], '中文:Saturated');
  assert.equal(out.detail.nutrition[1].columnHeaders[0].suffix, 'g');
  assert.deepEqual(out.detail.ingredients.ingredients, ['中文:Milk']);
});

test('brand and disclaimer remain unchanged and are never sent for translation', async () => {
  const row = fixture('woolworths');
  row.detail.productDisclaimerMessage = 'Please read the label';
  const paths = [];
  const out = await translateRow(row, async (text, context) => {
    paths.push(context.path);
    return translated(text);
  });
  assert.equal(out.brand, row.brand);
  assert.equal(out.detail.brand, row.detail.brand);
  assert.equal(out.detail.productDisclaimerMessage, row.detail.productDisclaimerMessage);
  assert.equal(out.product_name, '中文:Original Milk');
  assert.ok(!paths.includes('row.brand'));
  assert.ok(!paths.includes('brand'));
  assert.ok(!paths.includes('productDisclaimerMessage'));
  assert.equal(out.translation.fieldCount, paths.length);
});
test('records Google provider metadata', async () => {
  const out = await translateRow(fixture(), translated);
  assert.equal(out.detail.name, '中文:Milk');
  assert.equal(out.translation.provider, 'google-v3');
});
test('processing never reads target for per-row completion checks', async () => {
  const row = fixture();
  const target = memoryTarget();
  target.findOne = async () => {
    throw new Error('unexpected completion lookup');
  };
  assert.equal(await processRow(row, target, { translate: translated }), 'written');
  assert.equal(target.writes, 1);
});
test('mid-row failure writes failed marker with original detail, without attempts', async () => {
  const target = memoryTarget();
  const row = fixture();
  let calls = 0;
  const result = await processRow(row, target, {
    translate: async (text) => {
      if (++calls === 2) throw new Error('provider unavailable');
      return text;
    },
  });
  assert.equal(result.failed, true);
  assert.equal(target.writes, 1);
  assert.equal(target.stored.translation.status, 'failed');
  assert.equal(target.stored.translation.error, 'provider unavailable');
  assert.deepEqual(target.stored.detail, row.detail);
  assert.equal(target.stored.product_name, row.product_name);
  assert.equal(target.stored.brand, row.brand);
  assert.equal(Object.hasOwn(target.stored, 'attempts'), false);
  assert.equal(await processRow(row, target, { translate: translated }), 'written');
});

test('missing and empty outer fields are preserved without translation', async () => {
  const row = fixture();
  delete row.product_name;
  row.brand = null;
  const out = await translateRow(row, translated);
  assert.equal(Object.hasOwn(out, 'product_name'), false);
  assert.equal(out.brand, null);
});

test('each row summary is logged after persistence, before the next row', async () => {
  const rows = [fixture(), fixture()];
  const events = [];
  const source = {
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => rows }) }) }),
  };
  const target = {
    findOne: async () => null,
    replaceOne: async (_, row) => events.push({ event: 'write', data: row }),
  };
  await runTranslation(source, target, {
    limit: 2,
    translate: translated,
    log: (value) => events.push(value),
  });
  assert.deepEqual(
    events.slice(0, 6).map((e) => e.event),
    ['row_started', 'write', 'row_processed', 'row_started', 'write', 'row_processed'],
  );
  assert.equal(events[2].product_name, '中文:Original Milk');
  assert.equal(events[2].productId, rows[0].productId);
  assert.equal(Object.hasOwn(events[1].data, 'attempts'), false);
});
test('empty translations, HTML details and unknown sources never create completed rows', async () => {
  const target = memoryTarget();
  assert.equal((await processRow(fixture(), target, { translate: async () => '' })).failed, true);
  const html = fixture('woolworths');
  html.detail = '<html>Access denied</html>';
  assert.equal((await processRow(html, target)).failed, true);
  assert.equal((await processRow(fixture('unknown'), target)).failed, true);
  assert.equal(target.writes, 3);
  assert.equal(target.stored.translation.status, 'failed');
});
test('dry run does not write; DB write failures propagate', async () => {
  const target = memoryTarget();
  assert.equal(
    await processRow(fixture(), target, { dryRun: true, translate: translated }),
    'previewed',
  );
  assert.equal(target.writes, 0);
  target.replaceOne = async () => {
    throw new Error('DB unavailable');
  };
  await assert.rejects(processRow(fixture(), target, { translate: translated }), /DB unavailable/);
});

test('max ID resumes across batches and executions; failed rows advance cursor', async () => {
  const rows = Array.from({ length: 205 }, () => fixture());
  rows[100].detail = '<html>invalid</html>';
  const stored = [];
  const requested = [];
  let lookups = 0;
  const target = {
    findOne: async () => {
      lookups++;
      return stored.at(-1) ?? null;
    },
    replaceOne: async (_, row) => {
      stored.push(row);
    },
  };
  const source = {
    find: (filter) => ({
      sort: () => ({
        limit: (size) => ({
          toArray: async () => {
            requested.push(size);
            return rows
              .filter((r) => !filter._id || r._id.toHexString() > filter._id.$gt.toHexString())
              .slice(0, size);
          },
        }),
      }),
    }),
  };
  const first = await runTranslation(source, target, {
    limit: 150,
    translate: translated,
    log: () => {},
  });
  assert.equal(first.processed, 150);
  assert.equal(first.failed, 1);
  assert.deepEqual(requested, [100, 50]);
  const second = await runTranslation(source, target, {
    limit: 55,
    translate: translated,
    log: () => {},
  });
  assert.equal(second.processed, 55);
  assert.equal(stored.length, 205);
  assert.equal(new Set(stored.map((r) => r._id.toHexString())).size, 205);
  assert.equal(lookups, 2);
});

test('failed DB write aborts before later IDs are processed', async () => {
  const rows = [fixture(), fixture(), fixture()];
  const source = {
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => rows }) }) }),
  };
  let writes = 0;
  const target = {
    findOne: async () => null,
    replaceOne: async () => {
      if (++writes === 2) throw new Error('write failed');
    },
  };
  await assert.rejects(
    runTranslation(source, target, { translate: translated, log: () => {} }),
    /write failed/,
  );
  assert.equal(writes, 2);
});
