import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { acquireRedisLock } from '../src/db/redis.ts';
import { withRedisTranslationCache } from '../src/providers/redis-cache.ts';
import { TranslationRuntimeError } from '../src/providers/errors.ts';

test('isolated Redis: shared cache, in-flight deduplication and token-safe locks', async (t) => {
  if (spawnSync('redis-server', ['--version']).status !== 0) {
    t.skip('redis-server unavailable; no external Redis instance is used');
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), 'grocer-redis-'));
  const socket = join(directory, 'redis.sock');
  const server = spawn(
    'redis-server',
    ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let redis;
  t.after(async () => {
    if (redis?.isOpen) redis.destroy();
    if (server.exitCode === null) {
      const stopped = once(server, 'exit');
      server.kill('SIGTERM');
      await stopped;
    }
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test Redis startup timeout')), 5000);
    server.once('error', reject);
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Test Redis exited: ${code}`));
    });
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().toLowerCase().includes('ready to accept connections')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  redis = createClient({
    socket: { path: socket, reconnectStrategy: false },
    disableOfflineQueue: true,
  });
  redis.on('error', () => {});
  await redis.connect();
  const context = { lang: 'test', source: 'new-world', path: 'name' };
  let calls = 0;
  const translate = withRedisTranslationCache(
    async () => {
      calls++;
      await delay(20);
      return '牛奶';
    },
    redis,
    async () => {},
  );
  const values = await Promise.all(
    ['Milk', 'MILK', 'milk', 'Milk'].map((text) => translate(text, context)),
  );
  assert.deepEqual(values, ['牛奶', '牛奶', '牛奶', '牛奶']);
  assert.equal(calls, 1);
  const anotherProvider = withRedisTranslationCache(
    async () => assert.fail('cache should be shared'),
    redis,
    async () => {},
  );
  assert.equal(await anotherProvider('milk', context), '牛奶');
  await translate('Milk', { ...context, lang: 'another' });
  assert.equal(calls, 2);
  await translate('x'.repeat(101), context);
  await translate('x'.repeat(101), context);
  assert.equal(calls, 4);

  const first = await acquireRedisLock(redis, 'test:run');
  await assert.rejects(acquireRedisLock(redis, 'test:run'), /lock unavailable/);
  await redis.set(first.key, 'new-owner');
  await first.release();
  assert.equal(await redis.get(first.key), 'new-owner');
  // 运行锁丢失后缓存调用立即停止，不向 API 发起请求。
  const stopped = withRedisTranslationCache(
    async () => assert.fail('must not call API'),
    redis,
    async () => {
      throw new TranslationRuntimeError('lost');
    },
  );
  await assert.rejects(stopped('milk', context), TranslationRuntimeError);
  redis.destroy();
  await assert.rejects(translate('milk', context), TranslationRuntimeError);
});
