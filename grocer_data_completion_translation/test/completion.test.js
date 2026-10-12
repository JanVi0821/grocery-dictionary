import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { COMPLETE_MARK } from '../src/config/translation.ts';
import { markTranslationCompleted } from '../src/workflow/completion.ts';
import { runTranslation } from '../src/workflow/incremental-translation-runner.ts';
import { runFilteredTranslation } from '../workflow/incremental-translation-runner-filtered.ts';
import { retryFailedTranslations } from '../src/workflow/retry-failed.ts';

function fixture() {
  return {
    _id: new ObjectId(),
    productId: 123,
    source: 'new-world',
    needsReview: false,
    detail: { name: 'Milk' },
  };
}

function database(row, { targetError, markError } = {}) {
  const events = [];
  const find = (filter) => {
    const cursor = {
      sort: () => cursor,
      project: () => cursor,
      limit: () => cursor,
      toArray: async () => (filter._id?.$gt ? [] : [row]),
    };
    return cursor;
  };
  const source = {
    find,
    findOne: async () => row,
    updateOne: async (filter, update) => {
      events.push({ event: 'mark', filter, update });
      if (markError) throw markError;
      return { matchedCount: 1 };
    },
  };
  const target = {
    find,
    findOne: async () => null,
    replaceOne: async (filter, result) => {
      events.push({ event: 'write', filter, result });
      if (targetError) throw targetError;
    },
  };
  return { source, target, events };
}

for (const [name, run] of [
  ['translate', runTranslation],
  ['translate:filter', runFilteredTranslation],
  ['retry:failed', retryFailedTranslations],
]) {
  test(`${name}: mark the source by its _id only after the translation is written`, async () => {
    const row = fixture();
    const { source, target, events } = database(row);
    const result = await run(source, target, {
      limit: 1,
      translate: async () => '牛奶',
      log: () => {},
    });
    assert.equal(result.written, 1);
    assert.deepEqual(
      events.map((event) => event.event),
      ['write', 'mark'],
    );
    assert.deepEqual(events[1].filter, { _id: row._id });
    assert.deepEqual(events[1].update, { $set: COMPLETE_MARK });
    assert.equal(events[0].result.translation.status, 'completed');
  });

  test(`${name}: failed translation never marks the source`, async () => {
    const { source, target, events } = database(fixture());
    await run(source, target, { limit: 1, log: () => {}, translate: async () => '' });
    assert.equal(events[0].result.translation.status, 'failed');
    assert.deepEqual(
      events.map((event) => event.event),
      ['write'],
    );
  });

  test(`${name}: target write failure prevents marking; source mark failure aborts`, async () => {
    for (const failure of ['targetError', 'markError']) {
      const { source, target, events } = database(fixture(), { [failure]: new Error(failure) });
      await assert.rejects(
        run(source, target, { limit: 1, translate: async () => '牛奶', log: () => {} }),
        new RegExp(failure),
      );
      assert.deepEqual(
        events.map((event) => event.event),
        failure === 'targetError' ? ['write'] : ['write', 'mark'],
      );
    }
  });
}

test('empty COMPLETE_MARK skips source updates in every workflow', async (t) => {
  const original = { ...COMPLETE_MARK };
  t.after(() => Object.assign(COMPLETE_MARK, original));
  for (const key of Object.keys(COMPLETE_MARK)) delete COMPLETE_MARK[key];
  for (const run of [runTranslation, runFilteredTranslation, retryFailedTranslations]) {
    const { source, target, events } = database(fixture());
    const result = await run(source, target, {
      limit: 1,
      translate: async () => '牛奶',
      log: () => {},
    });
    assert.equal(result.written, 1);
    assert.deepEqual(
      events.map((event) => event.event),
      ['write'],
    );
  }
});

test('marking a missing source fails, but an already-marked record succeeds', async () => {
  const row = fixture();
  await assert.rejects(
    markTranslationCompleted({ updateOne: async () => ({ matchedCount: 0 }) }, row),
    /not found/,
  );
  await markTranslationCompleted(
    { updateOne: async () => ({ matchedCount: 1, modifiedCount: 0 }) },
    row,
  );
});

test('retry associates source by productId even when target _id differs', async () => {
  const row = fixture();
  const targetId = new ObjectId();
  let stored;
  let sourceQuery;
  const source = {
    findOne: async (filter) => {
      sourceQuery = filter;
      return filter.productId === row.productId ? row : null;
    },
    updateOne: async () => ({ matchedCount: 1 }),
  };
  const target = {
    find: () => {
      const cursor = {
        project: (projection) => {
          assert.deepEqual(projection, { _id: 1, productId: 1 });
          return cursor;
        },
        sort: () => cursor,
        limit: () => cursor,
        toArray: async () => [{ _id: targetId, productId: row.productId }],
      };
      return cursor;
    },
    replaceOne: async (filter, replacement, options) => {
      assert.deepEqual(filter, { productId: row.productId });
      assert.deepEqual(options, { upsert: true });
      assert.equal(Object.hasOwn(replacement, '_id'), false);
      stored = { ...replacement, _id: targetId };
    },
  };
  const result = await retryFailedTranslations(source, target, {
    limit: 1,
    translate: async () => '牛奶',
    log: () => {},
  });
  assert.deepEqual(sourceQuery, { productId: row.productId });
  assert.equal(result.written, 1);
  assert.equal(result.sourceMissing, 0);
  assert.equal(stored.translation.status, 'completed');
  assert.equal(stored._id, targetId);
});
