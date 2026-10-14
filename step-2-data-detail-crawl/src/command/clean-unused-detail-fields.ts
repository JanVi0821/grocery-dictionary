/** 清洗当前 MongoDB 集合的历史 detail；先备份，按抓取规则 $unset，可重复执行。 */
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { products, closeDb, database } from "../db.ts";
import { unusedRowFieldPaths, UNUSED_ROW_FIELDS } from "../detail-fields.ts";

const BATCH_SIZE = 100;
try {
  const source = await products();
  const backupName = `${source.collectionName}_detail_fields_backup_${new Date().toISOString().replace(/\D/g, "")}`;
  const backup = database().collection(backupName);
  const counts = {
    scanned: 0,
    backedUp: 0,
    matched: 0,
    modified: 0,
    changedDuringCleanup: 0,
  };
  const cursor = source
    .find(
      {
        $or: [
          ...UNUSED_ROW_FIELDS.map((field) => ({ [field]: { $exists: true } })),
          {
            source: { $in: ["new-world", "paknsave", "woolworths"] },
            $expr: { $eq: [{ $type: "$detail" }, "object"] },
          },
        ],
      },
      {
        projection: {
          _id: 1,
          productId: 1,
          source: 1,
          detail: 1,
          ...Object.fromEntries(UNUSED_ROW_FIELDS.map((field) => [field, 1])),
        },
      },
    )
    .batchSize(BATCH_SIZE);
  let pending: { row: Document; paths: string[] }[] = [];
  console.log(
    JSON.stringify({
      event: "cleanup_started",
      source: source.namespace,
      backup: backup.namespace,
    }),
  );
  async function flush() {
    if (!pending.length) return;
    // 备份必须成功后才允许删除字段；中途失败时已备份内容仍保留。
    await backup.insertMany(
      pending.map(({ row, paths }) => ({
        ...row,
        removedPaths: paths,
        backedUpAt: new Date(),
      })),
    );
    counts.backedUp += pending.length;
    const operations: AnyBulkWriteOperation<Document>[] = pending.map(
      ({ row, paths }) => ({
        updateOne: {
          // 若读取后被其它进程更新，保留新数据；区分缺失字段和 null，确保备份可恢复。
          filter: {
            _id: row._id,
            $and: ["source", "detail", ...UNUSED_ROW_FIELDS].map((field) => ({
              [field]: Object.hasOwn(row, field)
                ? { $exists: true, $eq: row[field] }
                : { $exists: false },
            })),
          },
          update: {
            $unset: Object.fromEntries(paths.map((path) => [path, ""])),
          },
        },
      }),
    );
    const result = await source.bulkWrite(operations);
    counts.matched += result.matchedCount;
    counts.modified += result.modifiedCount;
    counts.changedDuringCleanup += pending.length - result.matchedCount;
    pending = [];
    console.log(JSON.stringify({ event: "cleanup_progress", ...counts }));
  }
  try {
    for await (const row of cursor) {
      counts.scanned++;
      const paths = unusedRowFieldPaths(row);
      if (!paths.length) continue;
      pending.push({ row, paths });
      if (pending.length >= BATCH_SIZE) await flush();
    }
    await flush();
  } finally {
    await cursor.close();
  }
  console.log(
    JSON.stringify({
      event: "cleanup_finished",
      source: source.namespace,
      backup: counts.backedUp ? backup.namespace : null,
      ...counts,
    }),
  );
  if (counts.changedDuringCleanup) process.exitCode = 1;
} finally {
  await closeDb();
}
