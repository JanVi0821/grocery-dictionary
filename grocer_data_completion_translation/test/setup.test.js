import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConnection } from '../src/db/mongodb.ts';
import { initializeDeeplTranslator } from '../src/providers/deepl.ts';

test('database helper supports crawler URI without connecting', async () => {
  const { client, db } = createDatabaseConnection(
    'mongodb://localhost:27017/grocery/data_completion',
  );
  assert.equal(db.databaseName, 'grocery');
  await client.close();
  assert.throws(() => createDatabaseConnection(''), /MONGODB_URI missing/);
  assert.throws(() => createDatabaseConnection('mongodb://localhost:27017'), /database name/);
});

test('DeepL initialization needs no Google credentials or API requests', () => {
  const keys = ['DEEPL_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.DEEPL_API_KEY = 'test:fx';
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    assert.equal(typeof initializeDeeplTranslator(), 'function');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
