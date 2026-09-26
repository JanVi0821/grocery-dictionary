import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeCacheSnapshot } from '../src/providers/cache-file.ts';
import { withShortTextCache } from '../src/providers/cache.ts';
import { runTranslation } from '../src/workflow/runner.ts';

test('snapshots contain original text keys, isolate language, and replace previous JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'translation-cache-test-'));
  try {
    const translate = withShortTextCache(async (_text, { lang }) =>
      lang === 'zh' ? '牛奶' : 'ミルク',
    );
    await translate('Milk', { lang: 'zh', source: 'new-world', path: 'name' });
    await translate('MILK', { lang: 'zh', source: 'new-world', path: 'name' });
    await translate('milk', { lang: 'zh', source: 'new-world', path: 'name' });
    await translate('Milk', { lang: 'ja', source: 'new-world', path: 'name' });
    const directory = pathToFileURL(dir + '/');
    const path = await writeCacheSnapshot(translate.snapshot('zh'), 'zh', directory);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { milk: '牛奶' });
    await translate('Tea', { lang: 'zh', source: 'new-world', path: 'name' });
    await writeCacheSnapshot(translate.snapshot('zh'), 'zh', directory);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { milk: '牛奶', tea: '牛奶' });
    assert.deepEqual(await readdir(dir), ['zh.json']);
    assert.deepEqual(withShortTextCache(async () => 'fresh').snapshot('zh'), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkpoint runs after each ten processed rows, across batches, but not the remainder', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    _id: i + 1,
    source: 'new-world',
    detail: {},
  }));
  const source = {
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => rows.splice(0, 7) }) }) }),
  };
  let writes = 0;
  const checkpoints = [];
  const target = {
    findOne: async () => null,
    replaceOne: async () => {
      writes++;
    },
  };
  const counts = await runTranslation(source, target, {
    translate: async () => assert.fail('empty rows need no API'),
    log: () => {},
    onCheckpoint: async (processed) => {
      assert.equal(writes, processed);
      checkpoints.push(processed);
    },
  });
  assert.equal(counts.processed, 25);
  assert.deepEqual(checkpoints, [10, 20]);
});
