import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { COMPLETE_MARK } from '../src/config/translation.ts';
import { runFilteredTranslation } from '../workflow/incremental-translation-runner-filtered.ts';

function setMark(t, mark) {
  const original = { ...COMPLETE_MARK };
  const replace = (value) => {
    for (const key of Object.keys(COMPLETE_MARK)) delete COMPLETE_MARK[key];
    Object.assign(COMPLETE_MARK, value);
  };
  replace(mark);
  t.after(() => replace(original));
}

function matches(row, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return condition.every((item) => matches(row, item));
    if (key === '$nor') return !condition.some((item) => matches(row, item));
    if (condition && typeof condition === 'object') {
      return Object.entries(condition).every(([operator, value]) => {
        if (operator === '$exists') return Object.hasOwn(row, key) === value;
        if (operator === '$eq') return isDeepStrictEqual(row[key], value);
        if (operator === '$gt') return row[key] > value;
        assert.fail(`Unexpected query operator: ${operator}`);
      });
    }
    return isDeepStrictEqual(row[key], condition);
  });
}

function database(rows) {
  const documents = new Map();
  const queries = [];
  const source = {
    find: (filter) => {
      let size = Infinity;
      const cursor = {
        sort: () => cursor,
        limit: (value) => {
          size = value;
          return cursor;
        },
        toArray: async () => rows.filter((row) => matches(row, filter)).slice(0, size),
      };
      queries.push(filter);
      return cursor;
    },
    updateOne: async (filter, update) => {
      const row = rows.find((row) => row._id === filter._id);
      if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set);
      return { matchedCount: 1 };
    },
  };
  // Deliberately expose no target reads: continuation depends only on source marks.
  const target = {
    replaceOne: async (filter, document, options) => {
      assert.equal(options.upsert, true);
      documents.set(filter.productId, document);
    },
  };
  return { source, target, documents, queries };
}

const row = (_id, extra = {}) => ({
  _id,
  productId: _id,
  source: 'new-world',
  needsReview: false,
  retryAllVersion: 1,
  detail: { name: `Milk ${_id}` },
  ...extra,
});
const options = {
  filter: { retryAllVersion: 1 },
  translate: async (text) => `译:${text}`,
  log: () => {},
};

test('repeated limited runs skip marked rows and continue only within the business filter', async (t) => {
  setMark(t, { completeTranslation: 1 });
  const rows = [row(1, { completeTranslation: 1 }), row(2), row(3), row(4, { retryAllVersion: 2 })];
  const { source, target, documents } = database(rows);
  for (const expected of [1, 1, 0]) {
    const counts = await runFilteredTranslation(source, target, { ...options, limit: 1 });
    assert.equal(counts.written, expected);
  }
  assert.deepEqual([...documents.keys()], [2, 3]);
  assert.equal(rows[1].completeTranslation, 1);
  assert.equal(rows[2].completeTranslation, 1);
  assert.equal(rows[3].completeTranslation, undefined);
});

test('multiple mark fields must all exist and match; null and object values are literal', async (t) => {
  setMark(t, { completeTranslation: 2, marker: null, metadata: { $gt: 1 } });
  const marked = { completeTranslation: 2, marker: null, metadata: { $gt: 1 } };
  const rows = [
    row(1, marked),
    row(2, { ...marked, completeTranslation: 1 }),
    row(3, { completeTranslation: 2, metadata: { $gt: 1 } }),
  ];
  const { source, target, documents } = database(rows);
  const counts = await runFilteredTranslation(source, target, options);
  assert.equal(counts.written, 2);
  assert.deepEqual([...documents.keys()], [2, 3]);
});

test('batch cursor preserves FILTER _id range and failure remains eligible on the next run', async (t) => {
  setMark(t, { completeTranslation: 1 });
  const rows = Array.from({ length: 105 }, (_, index) => row(index + 1));
  rows[1].detail = '<html>Invalid detail</html>';
  const { source, target, documents, queries } = database(rows);
  const filter = { retryAllVersion: 1, _id: { $gt: 1 } };
  const first = await runFilteredTranslation(source, target, { ...options, filter });
  assert.equal(first.processed, 104);
  assert.equal(first.failed, 1);
  assert.equal(documents.has(1), false);
  assert.equal(rows[1].completeTranslation, undefined);
  assert.ok(queries.every((query) => isDeepStrictEqual(query.$and[0], filter)));
  const second = await runFilteredTranslation(source, target, { ...options, filter });
  assert.equal(second.processed, 1);
  assert.equal(second.failed, 1);
});

test('empty COMPLETE_MARK disables both source updates and automatic skipping', async (t) => {
  setMark(t, {});
  const { source, target, documents, queries } = database([row(1, { completeTranslation: 1 })]);
  source.updateOne = async () => assert.fail('empty marker must not update source');
  for (let i = 0; i < 2; i++) {
    const counts = await runFilteredTranslation(source, target, { ...options, limit: 1 });
    assert.equal(counts.written, 1);
  }
  assert.equal(documents.size, 1);
  assert.ok(queries.every((query) => query.$and.length === 1));
});
