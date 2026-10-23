import { randomUUID } from 'node:crypto';
import { deeplKeyFile } from '../../../paths.ts';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { TranslationServiceError } from '../errors.ts';

/** key 耗尽或持久化失败必须立即停止，不进入接口重试或写入失败行。 */
export class DeepLKeyPoolError extends TranslationServiceError {}

/** 单进程顺序使用本地文件中的 key；仅 HTTP 456 才将其移入 usedKeys。 */
export async function createDeeplKeyPool(
  file = deeplKeyFile,
  assertRunning = async () => {},
) {
  let expectedContent = await readFile(file, 'utf8');
  const { DEEPL_API_KEYS, usedKeys } = await import(file.href);
  if (
    !Array.isArray(DEEPL_API_KEYS) ||
    !Array.isArray(usedKeys) ||
    [...DEEPL_API_KEYS, ...usedKeys].some(
      (key) => typeof key !== 'string' || !key.trim() || key !== key.trim(),
    )
  ) {
    throw new DeepLKeyPoolError('Invalid key entry in deep-api-keys.ts');
  }
  let available: string[] = [...DEEPL_API_KEYS];
  let used: string[] = [...usedKeys];

  function current(): string {
    const key = available[0];
    if (!key)
      throw new DeepLKeyPoolError(
        'DEEPL_API_KEYS exhausted; add available keys to deep-api-keys.ts before resuming',
      );
    return key;
  }
  current();

  let rotations = Promise.resolve();
  async function rotate(key: string) {
    // 多个在途请求可能同时收到旧 key 的 456；已轮换过就复用当前 key，不重复写文件。
    if (used.includes(key) && !available.includes(key)) {
      current();
      return;
    }
    if (key !== current()) throw new DeepLKeyPoolError('DeepL active key changed unexpectedly');
    const next = available.filter((value) => value !== key);
    const nextUsed = [...new Set([...used, key])];
    const content = `// Available keys are consumed in order; HTTP 456 moves a key to usedKeys.\nexport const DEEPL_API_KEYS: string[] = ${JSON.stringify(next, null, 2)};\n\nexport const usedKeys: string[] = ${JSON.stringify(nextUsed, null, 2)};\n`;
    const temporary = new URL(`./.deep-api-keys.${randomUUID()}.tmp`, file);
    try {
      await assertRunning();
      // 不覆盖运行期间用户手动编辑的文件；保存成功后才允许轮换。
      if ((await readFile(file, 'utf8')) !== expectedContent)
        throw new DeepLKeyPoolError(
          'deep-api-keys.ts changed during execution; restart to reload keys',
        );
      await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
      await assertRunning();
      await rename(temporary, file);
      expectedContent = content;
      available = next;
      used = nextUsed;
      DEEPL_API_KEYS.splice(0, DEEPL_API_KEYS.length, ...next);
      usedKeys.splice(0, usedKeys.length, ...nextUsed);
    } catch (error) {
      if (error instanceof DeepLKeyPoolError) throw error;
      throw new DeepLKeyPoolError(
        'Unable to persist exhausted DeepL key to deep-api-keys.ts; task stopped',
      );
    } finally {
      try {
        await rm(temporary, { force: true });
      } catch {
        throw new DeepLKeyPoolError('Unable to clean up temporary DeepL key file; task stopped');
      }
    }
    console.log(
      JSON.stringify({
        event: 'deepl_key_exhausted',
        remaining: available.length,
        used: used.length,
      }),
    );
    // 最后一把 key 也先保存，再停止当前行。
    current();
  }
  function exhaust(key: string) {
    const rotation = rotations.then(() => rotate(key));
    rotations = rotation; // 持久化失败后，后续轮换也失败，不继续使用不确定的状态。
    return rotation;
  }
  return { current, exhaust };
}

export type DeepLKeyPool = Awaited<ReturnType<typeof createDeeplKeyPool>>;
