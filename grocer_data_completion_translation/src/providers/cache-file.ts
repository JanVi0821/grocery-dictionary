import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Load the shared language snapshot, falling back to legacy provider snapshots. */
export async function readCacheSnapshot(
  lang: string,
  directory = new URL('../cache/', import.meta.url),
): Promise<Record<string, string>> {
  if (!/^[a-zA-Z0-9-]+$/.test(lang)) throw new Error('Invalid cache snapshot language');
  try {
    return parseSnapshot(await readFile(new URL(`${lang}.json`, directory), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(
        `Unable to load ${lang} cache snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Preserve existing caches created before all providers shared one file.
  const combined: Record<string, string> = {};
  let foundLegacy = false;
  for (const provider of ['google-v3', 'baidu', 'baidu-llm', 'deepl']) {
    try {
      Object.assign(
        combined,
        parseSnapshot(await readFile(new URL(`${provider}-${lang}.json`, directory), 'utf8')),
      );
      foundLegacy = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(
          `Unable to load legacy ${provider}-${lang} cache: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return foundLegacy ? combined : {};
}

function parseSnapshot(content: string): Record<string, string> {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Cache snapshot must be a JSON object');
  }
  if (
    Object.entries(value).some(
      ([key, translation]) =>
        key !== key.toLowerCase() || typeof translation !== 'string' || !translation.trim(),
    )
  ) {
    throw new Error('Cache snapshot has an invalid key or translation value');
  }
  return value as Record<string, string>;
}

/** Atomically replace the shared language snapshot. */
export async function writeCacheSnapshot(
  cache: Record<string, string>,
  lang: string,
  directory = new URL('../cache/', import.meta.url),
) {
  if (!/^[a-zA-Z0-9-]+$/.test(lang)) throw new Error('Invalid cache snapshot language');
  await mkdir(directory, { recursive: true });
  const destination = new URL(`${lang}.json`, directory);
  const temporary = new URL(`${lang}.${randomUUID()}.tmp`, directory);
  try {
    await writeFile(temporary, JSON.stringify(cache, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return fileURLToPath(destination);
}
