import type { TranslateText, Translator } from '../types/translation.ts';
import { withTranslationRetry } from './retry.ts';
import { createHash } from 'node:crypto';
import { createRedisConnection, acquireRedisLock } from '../db/redis.ts';
import { REDIS_NAMESPACE } from '../config/translation.ts';
import { withRedisTranslationCache } from './redis-cache.ts';
import { TranslationRuntimeError } from './errors.ts';

export type ProviderName = 'google' | 'deepl';
export interface TranslationProvider extends Translator {
  id: string;
  /** 提交商品前向 Redis 确认项目运行锁；连接中断或锁丢失即停止。 */
  assertRunning: () => Promise<void>;
}

/** Backwards-compatible default for direct row processing; the CLI injects its provider. */
let defaultGoogle: Promise<TranslationProvider> | undefined;
export const translateWithDefaultGoogle: TranslateText = async (text, context) => {
  defaultGoogle ??= initializeProvider('google').catch((error) => {
    defaultGoogle = undefined;
    throw error;
  });
  return (await defaultGoogle).translate(text, context);
};

/** 同一项目只运行一个命令，命令内部并发 worker；Redis 即时保存短文本缓存。 */
export async function initializeProvider(name: ProviderName): Promise<TranslationProvider> {
  const redis = createRedisConnection();
  let lock: Awaited<ReturnType<typeof acquireRedisLock>> | undefined;
  let provider: (Translator & { id: string }) | undefined;
  const assertRunning = async () => {
    try {
      if (!lock) throw new Error('Run lock missing');
      lock.assertOwned();
      if ((await redis.get(lock.key)) !== lock.token) throw new Error('Run lock lost');
      lock.assertOwned();
    } catch {
      throw new TranslationRuntimeError('Redis run lock lost or unavailable; task stopped');
    }
  };
  const close = async () => {
    try {
      await provider?.close();
    } finally {
      try {
        await lock?.release();
      } finally {
        if (redis.isOpen) redis.destroy();
      }
    }
  };
  try {
    await redis.connect();
    // key 文件跨语言、集合共用，因此运行锁按项目 key 文件路径隔离，而不是按目标表隔离。
    const keyFile = new URL('./deepl-api-keys/deep-api-keys.ts', import.meta.url).href;
    const project = createHash('sha256').update(keyFile).digest('hex');
    lock = await acquireRedisLock(redis, `${REDIS_NAMESPACE}:run:${project}`);
    provider = await initializeProviderResources(name, assertRunning);
    const translate = withRedisTranslationCache(
      withTranslationRetry(provider.translate, provider.id),
      redis,
      assertRunning,
    );
    return {
      ...provider,
      translate,
      assertRunning,
      close,
    };
  } catch (error) {
    // 初始化缓存等后续步骤失败时，调用方拿不到实例，需在这里释放 SDK 资源。
    await close();
    throw error;
  }
}

/** 仅初始化认证、key pool 和请求资源；缓存、重试由 initializeProvider 统一装配。 */
async function initializeProviderResources(
  name: ProviderName,
  assertRunning: () => Promise<void>,
): Promise<Translator & { id: string }> {
  switch (name) {
    case 'deepl': {
      const { initializeTranslator } = await import('./deepl.ts');
      return { id: name, ...(await initializeTranslator({ assertRunning })) };
    }
    case 'google': {
      const { initializeTranslator } = await import('./google.ts');
      return { id: 'google-v3', ...(await initializeTranslator()) };
    }
  }
}
