import test from 'node:test';
import assert from 'node:assert/strict';
import { withTranslationRetry } from '../src/providers/retry.ts';
import { TranslationServiceError } from '../src/providers/errors.ts';
import { processRow } from '../src/workflow/row.ts';

const context = { lang: 'zh', source: 'new-world', path: 'name' };
const options = { sleep: async () => {}, log: () => {} };

test('successful requests do not retry', async () => {
  let calls = 0;
  const translate = withTranslationRetry(
    async () => {
      calls++;
      return '牛奶';
    },
    'test',
    options,
  );
  assert.equal(await translate('Milk', context), '牛奶');
  assert.equal(calls, 1);
});
test('three retries after initial failure, with bounded backoff and safe logs', async () => {
  let calls = 0;
  const waits = [],
    logs = [];
  const translate = withTranslationRetry(
    async () => {
      if (++calls < 4) throw new Error('Authorization: Bearer secret-value');
      return '牛奶';
    },
    'test',
    {
      sleep: async (ms) => {
        waits.push(ms);
      },
      log: (event) => logs.push(event),
    },
  );
  assert.equal(await translate('Milk', context), '牛奶');
  assert.equal(calls, 4);
  assert.deepEqual(waits, [4000, 8000, 8000]);
  assert.deepEqual(
    logs.map((event) => event.retry),
    [1, 2, 3],
  );
  assert.ok(!JSON.stringify(logs).includes('secret-value'));
  assert.equal(logs[0].error.message, 'Authorization: Bearer [REDACTED]');
});
test('exhaustion stops without writing or translating subsequent fields', async () => {
  const calls = [];
  const translate = withTranslationRetry(
    async (text) => {
      calls.push(text);
      if (text === 'Milk') throw new TranslationServiceError('quota exhausted');
      return '名称';
    },
    'test',
    options,
  );
  const row = {
    _id: 'test',
    source: 'new-world',
    product_name: 'Original',
    detail: { name: 'Milk', description: 'Later' },
  };
  await assert.rejects(
    processRow(
      row,
      {
        replaceOne: async () => assert.fail('must not advance checkpoint'),
      },
      { translate },
    ),
    /4 retries \(5 attempts\).*quota exhausted/,
  );
  assert.deepEqual(calls, ['Original', 'Milk', 'Milk', 'Milk', 'Milk', 'Milk']);
});
test('retry logs serialize message, status and network cause without credentials', async () => {
  const logs = [];
  process.env.TEST_TRANSLATION_API_KEY = 'private-test-key';
  try {
    const error = Object.assign(
      new Error('request private-test-key failed', {
        cause: Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
      }),
      { status: 503 },
    );
    const translate = withTranslationRetry(
      async () => {
        throw error;
      },
      'test',
      {
        ...options,
        log: (event) => logs.push(JSON.parse(JSON.stringify(event))),
      },
    );
    await assert.rejects(translate('Milk', context), (error) => {
      assert.match(error.message, /connection reset/);
      assert.ok(!error.message.includes('private-test-key'));
      return true;
    });
    assert.equal(logs.length, 4);
    assert.deepEqual(
      logs.map((event) => event.delayMs),
      [4000, 8000, 8000, 16000],
    );
    assert.equal(logs[0].error.message, 'request [REDACTED] failed');
    assert.equal(logs[0].error.status, 503);
    assert.equal(logs[0].error.cause.code, 'ECONNRESET');
  } finally {
    delete process.env.TEST_TRANSLATION_API_KEY;
  }
});
test('empty responses retry and attempt counts reset for each field', async () => {
  let calls = 0;
  const translate = withTranslationRetry(async () => (++calls % 2 ? '' : '成功'), 'test', options);
  assert.equal(await translate('one', context), '成功');
  assert.equal(await translate('two', context), '成功');
  assert.equal(calls, 4);
});
