import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConnection } from '../../apps/data-pipeline/src/translation/db/mongodb.ts';
import { initializeTranslator as initializeDeeplTranslator } from '../../apps/data-pipeline/src/translation/providers/deepl.ts';
import { initializeTranslator as initializeGoogleTranslator } from '../../apps/data-pipeline/src/translation/providers/google.ts';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('database helper supports crawler URI without connecting', async () => {
  const { client, db } = createDatabaseConnection(
    'mongodb://localhost:27017/grocery/data_completion',
  );
  assert.equal(db.databaseName, 'grocery');
  await client.close();
  assert.throws(() => createDatabaseConnection(''), /MONGODB_URI missing/);
  assert.throws(() => createDatabaseConnection('mongodb://localhost:27017'), /database name/);
});

test('Google initialization returns an independent translator and closes its SDK instance', async () => {
  const events = [];
  const translator = await initializeGoogleTranslator({
    projectId: 'test-project',
    createClient: () => ({
      auth: { getClient: async () => events.push('auth') },
      translateText: async (request, options) => {
        assert.equal(request.parent, 'projects/test-project/locations/global');
        assert.equal(options.retry, null);
        events.push('translate');
        return [{ translations: [{ translatedText: '牛奶' }] }];
      },
      close: async () => events.push('close'),
    }),
  });
  assert.deepEqual(events, ['auth']);
  assert.equal(typeof translator.translate, 'function');
  assert.equal(typeof translator.close, 'function');
  assert.equal(
    await translator.translate('Milk', { lang: 'zh', source: 'new-world', path: 'name' }),
    '牛奶',
  );
  await translator.close();
  assert.deepEqual(events, ['auth', 'translate', 'close']);
});

test('Google initialization closes SDK resources when credential loading fails', async () => {
  let closed = 0;
  await assert.rejects(
    initializeGoogleTranslator({
      projectId: 'test-project',
      createClient: () => ({
        auth: {
          getClient: async () => {
            throw new Error('private credential details');
          },
        },
        close: async () => {
          closed++;
        },
      }),
    }),
    /Unable to load Google ADC credentials/,
  );
  assert.equal(closed, 1);
});

test('DeepL initialization uses a local pool without environment credentials or API requests', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'deepl-setup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = pathToFileURL(join(directory, 'deep-api-keys.ts'));
  await writeFile(file, 'export const DEEPL_API_KEYS = ["fake:fx"]; export const usedKeys = [];');
  const keys = ['DEEPL_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.DEEPL_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const translator = await initializeDeeplTranslator({ keyFile: file });
    assert.equal(typeof translator.translate, 'function');
    assert.equal(typeof translator.close, 'function');
    await translator.close();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
