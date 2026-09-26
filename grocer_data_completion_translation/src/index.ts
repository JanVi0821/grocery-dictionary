import { createDatabaseConnection } from './db.ts';
import { SOURCE_COLLECTION, TARGET_COLLECTION, LANG } from './config.ts';
import { runTranslation } from './workflow/runner.ts';
import { selectProvider, type TranslationProvider } from './providers/select.ts';
import { parseArgs } from './cli.ts';
import type { SourceDocument, TranslatedDocument } from './types.ts';

const { provider, dryRun, limit } = parseArgs(process.argv.slice(2));
const { client, db } = createDatabaseConnection();
let translator: TranslationProvider | undefined;
let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});
try {
  translator = await selectProvider(provider);
  await client.connect();
  const target = db.collection<TranslatedDocument>(TARGET_COLLECTION);
  console.log(
    JSON.stringify({
      source: SOURCE_COLLECTION,
      target: TARGET_COLLECTION,
      lang: LANG,
      provider: translator.id,
      dryRun,
    }),
  );
  if (dryRun)
    console.warn(
      'dry-run calls the selected translation API (billable); only MongoDB writes are disabled.',
    );
  const counts = await runTranslation(db.collection<SourceDocument>(SOURCE_COLLECTION), target, {
    limit,
    dryRun,
    translate: translator.translate,
    provider: translator.id,
    shouldStop: () => stopping,
    onCheckpoint: async (processed) => {
      const path = await translator!.saveCache!(LANG);
      console.log(JSON.stringify({ event: 'translation_cache_saved', processed, path }));
    },
  });
  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
  if (stopping) process.exitCode = 130;
} finally {
  await Promise.all([client.close(), translator?.close()]);
}
