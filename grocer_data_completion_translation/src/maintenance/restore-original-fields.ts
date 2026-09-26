import type { Document } from 'mongodb';
import { createDatabaseConnection } from '../db.ts';
import { isDeepStrictEqual } from 'node:util';
import { SOURCE_COLLECTION, TARGET_COLLECTION } from '../config.ts';

// One-off maintenance: default is read-only. --apply backs up documents before updating.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply')) throw new Error('Only --apply is supported');
const apply = args.includes('--apply');
const paths = ['brand', 'detail.brand', 'detail.productDisclaimerMessage'];
function read(doc: Document, path: string): { exists: boolean; value?: unknown } {
  let value: unknown = doc;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { exists: false };
    value = (value as Document)[key];
  }
  return { exists: true, value };
}

const { client, db } = createDatabaseConnection();
const counts = { scanned: 0, changedRows: 0, modified: 0, unmatched: 0, conflicts: 0, unsafe: 0 };
const fields: Record<string, number> = Object.fromEntries(paths.map((path) => [path, 0]));
const examples: unknown[] = [];
const backupName = `${TARGET_COLLECTION}_backup_restore_${new Date().toISOString().replace(/[^0-9]/g, '')}`;
try {
  await client.connect();
  const target = db.collection(TARGET_COLLECTION);
  const source = db.collection(SOURCE_COLLECTION);
  for await (const row of target.find({}).sort({ _id: 1 })) {
    counts.scanned++;
    const original = await source.findOne({ _id: row._id });
    if (!original || original.productId !== row.productId) {
      counts.unmatched++;
      continue;
    }
    const set: Document = {};
    const unset: Document = {};
    const conditions: Document[] = [];
    const changes: unknown[] = [];
    for (const path of paths) {
      const before = read(row, path);
      const after = read(original, path);
      if (isDeepStrictEqual(before, after)) continue;
      // Never replace an HTML/string detail with an object merely to restore one field.
      if (
        path.startsWith('detail.') &&
        (!row.detail ||
          typeof row.detail !== 'object' ||
          Array.isArray(row.detail) ||
          !original.detail ||
          typeof original.detail !== 'object' ||
          Array.isArray(original.detail))
      ) {
        counts.unsafe++;
        continue;
      }
      if (after.exists) set[path] = after.value;
      else unset[path] = '';
      conditions.push(
        before.exists
          ? { [path]: { $exists: true, $eq: before.value } }
          : { [path]: { $exists: false } },
      );
      fields[path]++;
      changes.push({ path, before, after });
    }
    if (!conditions.length) continue;
    counts.changedRows++;
    if (examples.length < 3)
      examples.push({ productId: row.productId, source: row.source, changes });
    if (apply) {
      // Full prior document permits recovery; preserve all unrelated fields with targeted updates.
      await db.collection(backupName).insertOne(row);
      const result = await target.updateOne(
        { _id: row._id, $and: conditions },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      );
      if (!result.matchedCount) {
        counts.conflicts++;
        throw new Error('Concurrent field change detected; stopped');
      }
      counts.modified += result.modifiedCount;
    }
  }
  console.log(
    JSON.stringify(
      {
        apply,
        target: TARGET_COLLECTION,
        backup: apply && counts.changedRows ? backupName : null,
        counts,
        fields,
        examples,
      },
      null,
      2,
    ),
  );
  if (counts.unmatched || counts.unsafe || counts.conflicts) process.exitCode = 1;
} finally {
  await client.close();
}
