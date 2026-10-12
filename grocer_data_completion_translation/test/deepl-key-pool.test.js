import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createDeeplKeyPool,
  DeepLKeyPoolError,
} from '../src/providers/deepl-api-keys/deepl-key-pool.ts';
import { createDeeplTranslationFunction } from '../src/providers/deepl.ts';
import { withTranslationRetry } from '../src/providers/retry.ts';
import { processRow } from '../src/workflow/row.ts';

async function fixture(t, available, used = []) {
  const directory = await mkdtemp(join(tmpdir(), 'deepl-key-pool-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = pathToFileURL(join(directory, 'deep-api-keys.ts'));
  await writeFile(
    file,
    `export const DEEPL_API_KEYS = ${JSON.stringify(available)};\nexport const usedKeys = ${JSON.stringify(used)};\n`,
  );
  return { file, directory };
}
const context = { lang: 'zh', source: 'new-world', path: 'name' };

test('456 persists key rotation, switches endpoint and translates the same field', async (t) => {
  const { file, directory } = await fixture(t, ['fake-free:fx', 'fake-pro']);
  const pool = await createDeeplKeyPool(file);
  const requests = [];
  const translate = createDeeplTranslationFunction(pool, {
    fetchImpl: async (url, options) => {
      requests.push({ url, key: options.headers.Authorization, body: options.body });
      return requests.length === 1
        ? new Response('', { status: 456 })
        : Response.json({ translations: [{ text: '牛奶' }] });
    },
  });
  assert.equal(await translate('Milk', context), '牛奶');
  assert.equal(pool.current(), 'fake-pro');
  assert.equal(requests[0].url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(requests[1].url, 'https://api.deepl.com/v2/translate');
  assert.equal(requests[0].body, requests[1].body);
  const saved = await readFile(file, 'utf8');
  assert.match(saved, /DEEPL_API_KEYS: string\[\] = \[\s*"fake-pro"\s*\]/);
  assert.match(saved, /usedKeys: string\[\] = \[\s*"fake-free:fx"\s*\]/);
  assert.deepEqual(await readdir(directory), ['deep-api-keys.ts']);
});

test('last exhausted key is saved, stops immediately and never writes the current row', async (t) => {
  const { file } = await fixture(t, ['fake-last:fx']);
  const pool = await createDeeplKeyPool(file);
  let calls = 0;
  const translate = withTranslationRetry(
    createDeeplTranslationFunction(pool, {
      fetchImpl: async () => {
        calls++;
        return new Response('', { status: 456 });
      },
    }),
    'deepl',
    {
      sleep: async () => assert.fail('pool exhaustion must not retry'),
      log: () => assert.fail('pool exhaustion must not log a retry'),
    },
  );
  await assert.rejects(
    processRow(
      {
        _id: 'source',
        productId: 123,
        source: 'new-world',
        needsReview: false,
        detail: { name: 'Milk' },
      },
      { replaceOne: async () => assert.fail('must not persist current row') },
      { translate },
    ),
    DeepLKeyPoolError,
  );
  assert.equal(calls, 1);
  const saved = await readFile(file, 'utf8');
  assert.match(saved, /DEEPL_API_KEYS: string\[\] = \[\]/);
  assert.match(saved, /usedKeys: string\[\] = \[\s*"fake-last:fx"\s*\]/);
});

test('manual edits are preserved and prevent switching keys', async (t) => {
  const { file } = await fixture(t, ['fake-first', 'fake-second']);
  const pool = await createDeeplKeyPool(file);
  const edited = '// manually edited\n';
  await writeFile(file, edited);
  await assert.rejects(pool.exhaust('fake-first'), /changed during execution/);
  assert.equal(pool.current(), 'fake-first');
  assert.equal(await readFile(file, 'utf8'), edited);
});

test('empty or invalid local pools fail initialization', async (t) => {
  for (const available of [[], [' '], [' fake-key'], [123]]) {
    const { file } = await fixture(t, available);
    await assert.rejects(createDeeplKeyPool(file), DeepLKeyPoolError);
  }
});

test('non-456 errors never exhaust a key', async (t) => {
  const { file } = await fixture(t, ['fake-first', 'fake-second']);
  const original = await readFile(file, 'utf8');
  const pool = await createDeeplKeyPool(file);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      createDeeplTranslationFunction(pool, {
        fetchImpl: async () => new Response('', { status }),
      })('Milk', context),
    );
    assert.equal(pool.current(), 'fake-first');
    assert.equal(await readFile(file, 'utf8'), original);
  }
});
