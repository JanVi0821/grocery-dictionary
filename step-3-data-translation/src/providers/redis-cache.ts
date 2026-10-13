import { createHash } from 'node:crypto';
import {
  GLOBAL_CACHE_MAX_CHARS,
  REDIS_NAMESPACE,
  CACHE_LOCK_WAIT_MS,
} from '../config/translation.ts';
import { acquireRedisLock, type RedisConnection } from '../db/redis.ts';
import { TranslationRuntimeError } from './errors.ts';
import type { TranslateText } from '../types/translation.ts';

// 只允许仍持有文本锁的 worker 提交，并保留第一份成功译文。
const COMMIT = `
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return false end
redis.call('HSETNX',KEYS[2],ARGV[2],ARGV[3])
return redis.call('HGET',KEYS[2],ARGV[2])`;

/** provider 共用语言缓存；小写原文是 Hash field，同文案在途请求通过文本锁合并。 */
export function withRedisTranslationCache(
  translate: TranslateText,
  redis: RedisConnection,
  assertRunning: () => Promise<void>,
): TranslateText {
  return async (text, context) => {
    await assertRunning();
    if (
      !text.trim() ||
      GLOBAL_CACHE_MAX_CHARS <= 0 ||
      Array.from(text).length > GLOBAL_CACHE_MAX_CHARS
    )
      return translate(text, context);
    const name = `${REDIS_NAMESPACE}:cache:${context.lang}`;
    const field = text.toLowerCase();
    const hit = (value: string) => {
      console.log(
        JSON.stringify({
          event: 'translation_cache_hit',
          cache: 'redis',
          source: context.source,
          lang: context.lang,
          field: context.path,
          text,
        }),
      );
      return value;
    };
    // Redis 错误不能被当成商品数据错误写入 failed。
    async function redisOperation<T>(operation: () => Promise<T>): Promise<T> {
      try {
        return await operation();
      } catch {
        throw new TranslationRuntimeError('Redis cache operation failed; task stopped');
      }
    }
    const cached = await redisOperation(() => redis.hGet(name, field));
    if (cached !== null) return hit(cached);
    const digest = createHash('sha256').update(field).digest('hex');
    const lock = await redisOperation(() =>
      acquireRedisLock(redis, `${name}:lock:${digest}`, CACHE_LOCK_WAIT_MS),
    );
    try {
      await assertRunning();
      const existing = await redisOperation(() => redis.hGet(name, field));
      if (existing !== null) return hit(existing);
      const result = await translate(text, context);
      if (!result.trim()) throw new Error(`Empty translation: ${context.path}`);
      await assertRunning();
      lock.assertOwned();
      const saved = await redisOperation(() =>
        redis.eval(COMMIT, { keys: [lock.key, name], arguments: [lock.token, field, result] }),
      );
      if (typeof saved !== 'string')
        throw new TranslationRuntimeError('Redis text lock lost before cache write');
      return saved;
    } finally {
      await redisOperation(() => lock.release());
    }
  };
}
