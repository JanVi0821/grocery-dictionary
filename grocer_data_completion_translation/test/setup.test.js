import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConnection } from '../src/db.ts';
import { selectProvider } from '../src/providers/select.ts';

test('database helper supports crawler URI without connecting', async () => {
  const { client, db } = createDatabaseConnection(
    'mongodb://localhost:27017/grocery/data_completion',
  );
  assert.equal(db.databaseName, 'grocery');
  await client.close();
  assert.throws(() => createDatabaseConnection(''), /MONGODB_URI missing/);
  assert.throws(() => createDatabaseConnection('mongodb://localhost:27017'), /database name/);
});

test('Baidu and DeepL provider selection needs no Google credentials or API requests', async () => {
  const keys = [
    'BAIDU_APP_ID',
    'BAIDU_API_KEY',
    'BAIDU_LLM_API_KEY',
    'DEEPL_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.BAIDU_APP_ID = 'test';
    process.env.BAIDU_API_KEY = 'test';
    process.env.BAIDU_LLM_API_KEY = 'test';
    process.env.DEEPL_API_KEY = 'test:fx';
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    for (const name of ['baidu', 'baidu-llm', 'deepl']) {
      const provider = await selectProvider(name);
      assert.equal(provider.id, name);
      assert.equal(typeof provider.translate, 'function');
      await provider.close();
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
