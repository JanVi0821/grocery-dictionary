import { createHash } from "node:crypto";
import type { Collection, Db } from "mongodb";
import type { Product } from "./catalog.ts";
import {
  FILTER_TASK_COLLECTION_PREFIX,
  type SupabaseCrawlFilter,
} from "./filter-crawl-config.ts";

type Manifest = {
  _id: "manifest";
  kind: "manifest";
  filter: SupabaseCrawlFilter;
  status: "seeding" | "ready";
  seedAfterId: number;
  createdAt: Date;
  readyAt?: Date;
};
export type FilterProductTask = {
  _id: number;
  kind: "product";
  product: Product;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
  finishedAt?: Date;
  needsReview?: boolean;
  lastError?: string;
};
export type FilterTaskDocument = Manifest | FilterProductTask;

/** 哈希只取决于 filter；字段与操作符的键顺序不影响集合名。 */
export function filterCollectionIdentity(filter: SupabaseCrawlFilter) {
  for (const [column, operators] of Object.entries(filter)) {
    if (!operators || typeof operators !== "object" || Array.isArray(operators))
      throw new Error(`Invalid operators for ${column}`);
    for (const [operator, value] of Object.entries(operators)) {
      if (
        !operator ||
        (value !== null &&
          !["string", "number", "boolean"].includes(typeof value)) ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        throw new Error(`Invalid filter for ${column}`);
    }
  }
  const normalized = Object.fromEntries(
    Object.keys(filter)
      .sort()
      .map((column) => [
        column,
        Object.fromEntries(
          Object.keys(filter[column as keyof SupabaseCrawlFilter]!)
            .sort()
            .map((operator) => [
              operator,
              filter[column as keyof SupabaseCrawlFilter]![operator],
            ]),
        ),
      ]),
  );
  const hash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  return {
    collectionName: `${FILTER_TASK_COLLECTION_PREFIX}${hash}`,
    filter: normalized,
  };
}

/** 首次完整导入再抓取；ready 后绝不重新读取 Supabase。导入游标只用于恢复未完成的初始化。 */
export async function seedFilterCollection(
  collection: Collection<FilterTaskDocument>,
  filter: SupabaseCrawlFilter,
  fetchPage: (
    afterId: number,
    filter: SupabaseCrawlFilter,
  ) => Promise<Product[]>,
) {
  await collection.updateOne(
    { _id: "manifest" },
    {
      $setOnInsert: {
        kind: "manifest",
        filter,
        status: "seeding",
        seedAfterId: 0,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  const manifest = await collection.findOne({ _id: "manifest" });
  if (!manifest || manifest.kind !== "manifest")
    throw new Error("Filter collection manifest missing");
  if (manifest.status === "ready") return;
  let afterId = manifest.seedAfterId;
  while (true) {
    const page = await fetchPage(afterId, manifest.filter);
    if (!page.length) break;
    let nextId = afterId;
    for (const product of page) {
      if (!Number.isSafeInteger(product.id) || product.id <= nextId)
        throw new Error("Filter seed page must have increasing product IDs");
      nextId = product.id;
    }
    await collection.bulkWrite(
      page.map((product) => ({
        updateOne: {
          filter: { _id: product.id },
          update: {
            $setOnInsert: {
              kind: "product" as const,
              product,
              status: "pending" as const,
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
    );
    // 整批持久化后才推进；中断后重放该批使用 upsert，不覆盖已有任务标记。
    await collection.updateOne(
      { _id: "manifest" },
      { $set: { seedAfterId: nextId } },
    );
    afterId = nextId;
    console.log(
      JSON.stringify({
        event: "filtered_collection_seeded",
        collection: collection.collectionName,
        afterId,
        count: page.length,
      }),
    );
  }
  await collection.createIndex({ kind: 1, status: 1, _id: 1 });
  await collection.updateOne(
    { _id: "manifest" },
    { $set: { status: "ready", readyAt: new Date() } },
  );
}

export async function prepareFilterCollection(
  db: Db,
  filter: SupabaseCrawlFilter,
  fetchPage: (
    afterId: number,
    filter: SupabaseCrawlFilter,
  ) => Promise<Product[]>,
) {
  const identity = filterCollectionIdentity(filter);
  const collection = db.collection<FilterTaskDocument>(identity.collectionName);
  // MongoDB 首次 upsert 自动建集合；同名集合直接复用，无单独的 progress collection。
  await seedFilterCollection(collection, identity.filter, fetchPage);
  return collection;
}

export async function nextFilterTask(
  collection: Collection<FilterTaskDocument>,
): Promise<FilterProductTask | null> {
  const task = await collection.findOne(
    { kind: "product", status: { $in: ["pending", "failed"] } },
    { sort: { _id: 1 } },
  );
  // MongoDB WithId 会将联合类型的 _id 合并，kind 校验后恢复商品任务类型。
  return task?.kind === "product" ? (task as FilterProductTask) : null;
}

/** 结果先写业务集合，再标记任务；两步之间中断最多重做一条，不会丢任务。 */
export async function completeFilterTask(
  collection: Collection<FilterTaskDocument>,
  productId: number,
  needsReview: boolean,
  saveResult: () => Promise<void>,
) {
  await saveResult();
  const result = await collection.updateOne(
    { _id: productId, kind: "product" },
    {
      $set: { status: "completed", needsReview, finishedAt: new Date() },
      $unset: { lastError: "" },
    },
  );
  if (result.matchedCount !== 1)
    throw new Error(`Filter task missing: ${productId}`);
}
