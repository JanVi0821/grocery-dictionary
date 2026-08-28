import { MongoClient, type Collection, type Document } from "mongodb";

process.loadEnvFile();

const raw = process.env.MONGODB_URI?.trim();
if (!raw) throw new Error("MONGODB_URI missing");

const uri = new URL(raw);
const [dbName, collName = "data_completion"] = uri.pathname
  .split("/")
  .filter(Boolean);
uri.pathname = `/${dbName}`;

const client = new MongoClient(uri.toString());
let col: Collection<Document> | undefined;

export async function products() {
  if (!col) {
    await client.connect();
    col = client.db(dbName).collection(collName);
  }
  return col;
}

export async function closeDb() {
  await client.close();
  col = undefined;
}

export async function latestProductId() {
  const doc = await (await products())
    .find({})
    .sort({ productId: -1 })
    .limit(1)
    .next();
  return typeof doc?.productId === "number" ? doc.productId : 0;
}

export const NEEDS_REVIEW_FILTER = {
  needsReview: true,
  productId: { $gt: 2972 },
};

export async function retryProductIds(limit: number) {
  const docs = await (await products())
    .find(NEEDS_REVIEW_FILTER)
    .project({ productId: 1 })
    .sort({ productId: 1 })
    .limit(limit)
    .toArray();
  return docs
    .map((d) => d.productId)
    .filter((id): id is number => typeof id === "number");
}

export async function duplicateProductIdReport() {
  const groups = await (
    await products()
  )
    .aggregate<{
      _id: number;
      n: number;
    }>([
      { $group: { _id: "$productId", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  return {
    count: groups.length,
    examples: groups.slice(0, 10).map((g) => g._id),
  };
}

export async function ensureProductIdUniqueIndex() {
  await (
    await products()
  ).createIndex(
    { productId: 1 },
    {
      unique: true,
      name: "productId_unique",
    },
  );
}

export function completionFilter(productId: number) {
  return { productId };
}

export async function upsertProduct(
  productId: number,
  fields: Record<string, unknown>,
  source = "-",
) {
  await (
    await products()
  ).updateOne(
    completionFilter(productId),
    { $set: { source, productId, ...fields, at: new Date() } },
    { upsert: true },
  );
}
