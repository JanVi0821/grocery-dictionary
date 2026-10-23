import type { Collection } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { runConcurrentBatch } from './concurrent-batch.ts';
import { processRow } from './row.ts';
import { markTranslationCompleted } from './completion.ts';
import type { SourceDocument, TranslationTarget, TranslateText } from '../types/translation.ts';

export type PendingTranslationTask = { _id: number; taskId: string };

/** 普通增量：按目标最大 productId 续跑，每批最多 100 条，成功及数据失败均推进游标。 */
export async function runIncrementalTranslation(
  source: Pick<Collection<SourceDocument>, 'find' | 'findOne' | 'updateOne'>,
  target: TranslationTarget,
  {
    limit = Infinity,
    translate,
    provider,
    shouldStop = () => false,
    concurrency = 1,
    tasks,
    assertRunning = async () => {},
    log = (value: unknown) => console.log(JSON.stringify(value)),
  }: {
    limit?: number;
    translate?: TranslateText;
    provider?: string;
    shouldStop?: () => boolean;
    concurrency?: number;
    tasks?: Collection<PendingTranslationTask>;
    assertRunning?: () => Promise<void>;
    log?: (value: unknown) => void;
  } = {},
) {
  const counts = { processed: 0, written: 0, failed: 0 };
  if (concurrency > 1 && !tasks)
    throw new Error('Concurrent incremental translation requires durable pending tasks');

  async function processBatch(
    rows: SourceDocument[],
    taskIds = new Map<number, string>(),
    recovering = false,
  ) {
    await runConcurrentBatch(
      rows,
      concurrency,
      async (row, assertActive, worker) => {
        const taskId = taskIds.get(row.productId);
        log({
          event: 'row_started',
          worker,
          productId: row.productId,
          source: row.source,
          _id: row._id,
        });
        // 上次写结果后、写标记或删除待办前崩溃：补完提交，不重复付费翻译。
        const existing =
          recovering && taskId
            ? await target.findOne({ productId: row.productId, 'translation.taskId': taskId })
            : null;
        let result: Awaited<ReturnType<typeof processRow>>;
        if (existing) {
          await assertActive();
          if (existing.translation.status === 'completed') {
            await markTranslationCompleted(source, row);
            result = 'written';
          } else result = { failed: true, message: existing.translation.error };
          log({ event: 'row_pending_recovered', productId: row.productId });
        } else {
          result = await processRow(row, target, {
            translate: translate
              ? async (text, context) => {
                  await assertActive();
                  return translate(text, context);
                }
              : undefined,
            provider,
            taskId,
            beforeWrite: assertActive,
            onCompleted: async () => {
              await assertActive();
              await markTranslationCompleted(source, row);
            },
            onProcessed: (data) =>
              log({
                event: 'row_processed',
                worker,
                product_name: data.product_name,
                productId: data.productId,
              }),
          });
        }
        await assertActive();
        if (taskId) await tasks!.deleteOne({ _id: row.productId, taskId });
        counts.processed++;
        if (typeof result === 'string') counts.written++;
        else counts.failed++;
      },
      shouldStop,
      assertRunning,
    );
    log(counts);
  }

  // 优先恢复较小 ID 待办，然后再读取目标最大 productId；崩溃不会造成乱序遗漏。
  if (tasks) {
    while (!shouldStop() && counts.processed < limit) {
      await assertRunning();
      const pending = await tasks
        .find({})
        .sort({ _id: 1 })
        .limit(Math.min(100, limit - counts.processed))
        .toArray();
      if (!pending.length) break;
      const rows: SourceDocument[] = [];
      for (const task of pending) {
        const row = await source.findOne({ productId: task._id });
        if (!row) throw new Error(`Pending source product missing: ${task._id}`);
        rows.push(row);
      }
      await processBatch(rows, new Map(pending.map((task) => [task._id, task.taskId])), true);
    }
  }
  // Includes failed rows: these have been attempted and are retried separately.
  const latest = await target.findOne(
    {},
    { sort: { productId: -1 }, projection: { productId: 1 } },
  );
  let afterProductId = latest?.productId;
  while (!shouldStop() && counts.processed < limit) {
    const rows = await source
      .find({
        needsReview: false,
        ...(afterProductId !== undefined ? { productId: { $gt: afterProductId } } : {}),
      })
      .sort({ productId: 1 })
      .limit(Math.min(100, limit - counts.processed))
      .toArray();
    if (!rows.length) break;
    const taskIds = new Map(rows.map((row) => [row.productId, randomUUID()]));
    await assertRunning();
    if (tasks)
      await tasks.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { _id: row.productId },
            update: { $setOnInsert: { taskId: taskIds.get(row.productId)! } },
            upsert: true,
          },
        })),
      );
    await processBatch(rows, tasks ? taskIds : undefined);
    afterProductId = rows.at(-1)!.productId;
  }
  return counts;
}
