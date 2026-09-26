import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleTranslator } from '../src/providers/google.ts';
import { TranslationServiceError } from '../src/providers/errors.ts';
import { processRow } from '../src/workflow/row.ts';
import { ObjectId } from 'mongodb';

test('v3 uses project/global, English input, target language and plain text', async () => {
  const translate = createGoogleTranslator('test-project', async (request) => {
    assert.deepEqual(request, {
      parent: 'projects/test-project/locations/global',
      contents: ['Milk'],
      sourceLanguageCode: 'en',
      targetLanguageCode: 'zh',
      mimeType: 'text/plain',
    });
    return '牛奶';
  });
  assert.equal(await translate('Milk', { lang: 'zh', source: 'new-world', path: 'name' }), '牛奶');
});

test('HTML description uses HTML mode without stripping markup', async () => {
  const translate = createGoogleTranslator('project', async (request) => {
    assert.equal(request.mimeType, 'text/html');
    assert.deepEqual(request.contents, ['<p>Milk</p>']);
    return '<p>牛奶</p>';
  });
  assert.equal(
    await translate('<p>Milk</p>', { lang: 'zh', source: 'woolworths', path: 'description' }),
    '<p>牛奶</p>',
  );
});

test('empty responses fail and blank inputs avoid requests', async () => {
  let calls = 0;
  const translate = createGoogleTranslator('project', async () => {
    calls++;
    return '';
  });
  const context = { lang: 'zh', source: 'paknsave', path: 'name' };
  assert.equal(await translate(' ', context), ' ');
  assert.equal(calls, 0);
  await assert.rejects(translate('Milk', context), /Empty Google translation/);
});

test('auth and quota errors stop the job without advancing by writing a failed row', async () => {
  for (const code of [7, 8, 16, 401, 403, 429]) {
    const translate = createGoogleTranslator('project', async () => {
      throw { code };
    });
    const row = {
      _id: new ObjectId(),
      productId: 1,
      source: 'new-world',
      detail: { name: 'Milk' },
    };
    const target = { replaceOne: async () => assert.fail('must not advance checkpoint') };
    await assert.rejects(processRow(row, target, { translate }), TranslationServiceError);
  }
});

test('missing project fails before any API request', () => {
  assert.throws(() => createGoogleTranslator('', async () => 'unused'), TranslationServiceError);
});
