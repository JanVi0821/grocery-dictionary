import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { runConcurrentBatch } from '../src/workflow/concurrent-batch.ts';
import { runIncrementalTranslation } from '../src/workflow/incremental-translation-runner.ts';
import { withRequestRateLimit } from '../src/providers/rate-limit.ts';
import { TranslationServiceError } from '../src/providers/errors.ts';

test('rate limiter spaces starts but allows overlapping network requests', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const starts = [];
  const request = withRequestRateLimit(async (id) => {
    starts.push(Date.now());
    if (id === 1) await gate;
    return id;
  }, 20);
  const first = request(1);
  const second = request(2);
  try {
    assert.equal(await Promise.race([second, delay(500).then(() => 'timeout')]), 2);
    assert.ok(starts[1] - starts[0] >= 19);
  } finally {
    release();
    await first;
  }
});

test('fatal worker error stops allocation and waits for active workers without later commits', async () => {
  const started = [],
    written = [];
  let finished = false;
  await assert.rejects(
    runConcurrentBatch([1, 2, 3, 4], 2, async (id, guard) => {
      started.push(id);
      if (id === 1) {
        await delay(10);
        throw new Error('fatal');
      }
      try {
        await delay(30);
        await guard();
        written.push(id);
      } finally {
        finished = true;
      }
    }),
    /fatal/,
  );
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(written, []);
  assert.equal(finished, true);
});

test('pending tasks recover a lower productId after a higher ID committed first', async () => {
  const rows = [1, 2, 3].map((productId) => ({
    _id: productId,
    productId,
    source: 'new-world',
    needsReview: false,
    detail: { name: `Milk ${productId}` },
  }));
  const saved = new Map(),
    pending = new Map();
  const cursor = (values) => {
    let count = Infinity;
    const value = {
      sort: () => value,
      limit: (n) => {
        count = n;
        return value;
      },
      toArray: async () => values.slice(0, count),
    };
    return value;
  };
  const source = {
    find: (filter) =>
      cursor(rows.filter((row) => !filter.productId || row.productId > filter.productId.$gt)),
    findOne: async (filter) => rows.find((row) => row.productId === filter.productId),
    updateOne: async () => ({ matchedCount: 1 }),
  };
  const target = {
    findOne: async (filter) => {
      if (filter.productId !== undefined) {
        const row = saved.get(filter.productId);
        return row?.translation.taskId === filter['translation.taskId'] ? row : null;
      }
      return [...saved.values()].sort((a, b) => b.productId - a.productId)[0] ?? null;
    },
    replaceOne: async (filter, row) => {
      saved.set(filter.productId, row);
    },
  };
  const tasks = {
    find: () => cursor([...pending.values()].sort((a, b) => a._id - b._id)),
    bulkWrite: async (operations) => {
      for (const { updateOne: op } of operations) {
        if (!pending.has(op.filter._id))
          pending.set(op.filter._id, { _id: op.filter._id, ...op.update.$setOnInsert });
      }
    },
    deleteOne: async (filter) => {
      if (pending.get(filter._id)?.taskId === filter.taskId) pending.delete(filter._id);
    },
  };
  await assert.rejects(
    runIncrementalTranslation(source, target, {
      tasks,
      concurrency: 2,
      limit: 3,
      log: () => {},
      translate: async (text) => {
        if (text === 'Milk 1') {
          await delay(30);
          throw new TranslationServiceError('fatal');
        }
        return `译:${text}`;
      },
    }),
    /fatal/,
  );
  assert.equal(saved.has(1), false);
  assert.equal(saved.has(2), true);
  assert.equal(pending.has(1), true);
  const translated = [];
  const counts = await runIncrementalTranslation(source, target, {
    tasks,
    concurrency: 2,
    limit: 3,
    log: () => {},
    translate: async (text) => {
      translated.push(text);
      return `译:${text}`;
    },
  });
  assert.equal(counts.written, 1);
  assert.deepEqual([...saved.keys()].sort(), [1, 2, 3]);
  assert.deepEqual(translated, ['Milk 1']);
  assert.equal(pending.size, 0);
});

test('crash between translation persistence and source marking resumes without another API call', async () => {
  const row = {
    _id: 1,
    productId: 1,
    source: 'new-world',
    needsReview: false,
    detail: { name: 'Milk' },
  };
  let saved,
    pending,
    failMark = true,
    calls = 0;
  const cursor = (values) => {
    const c = { sort: () => c, limit: () => c, toArray: async () => values };
    return c;
  };
  const source = {
    find: (filter) => cursor(filter.productId ? [] : [row]),
    findOne: async () => row,
    updateOne: async () => {
      if (failMark) throw new Error('mark failure');
      return { matchedCount: 1 };
    },
  };
  const target = {
    findOne: async (filter) =>
      !filter.productId || filter['translation.taskId'] === saved?.translation.taskId
        ? (saved ?? null)
        : null,
    replaceOne: async (_, data) => {
      saved = data;
    },
  };
  const tasks = {
    find: () => cursor(pending ? [pending] : []),
    bulkWrite: async (ops) => {
      pending = { _id: 1, ...ops[0].updateOne.update.$setOnInsert };
    },
    deleteOne: async () => {
      pending = undefined;
    },
  };
  const options = {
    tasks,
    concurrency: 2,
    limit: 1,
    log: () => {},
    translate: async () => {
      calls++;
      return '牛奶';
    },
  };
  await assert.rejects(runIncrementalTranslation(source, target, options), /mark failure/);
  assert.ok(pending);
  failMark = false;
  await runIncrementalTranslation(source, target, options);
  assert.equal(calls, 1);
  assert.equal(pending, undefined);
});
