import { MongoClient, type Collection, type Document } from "mongodb";
import { removeUnusedDetailFields } from "./detail-fields.ts";
import {
  RETRY_ALL_MARKER,
  RETRY_INVALID_DETAIL_MARKER,
  type RetryMarker,
} from "./retry-config.ts";

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
  if (typeof doc?.productId !== "number") return 0;
  return doc.productId;
}
// Null/missing detail are ordinary no-match records and remain the concern of
// --retry-needs-review. This filter targets malformed, non-null detail values.

export const NEEDS_REVIEW_FILTER = {
  needsReview: true,
  [RETRY_ALL_MARKER.field]: { $ne: RETRY_ALL_MARKER.version },
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

export const INVALID_DETAIL_FILTER = {
  $and: [
    {
      $expr: {
        $and: [
          { $ne: [{ $type: "$detail" }, "object"] },
          { $ne: [{ $type: "$detail" }, "null"] },
          { $ne: [{ $type: "$detail" }, "missing"] },
        ],
      },
    },
    {
      [RETRY_INVALID_DETAIL_MARKER.field]: {
        $ne: RETRY_INVALID_DETAIL_MARKER.version,
      },
    },
  ],
};

export async function invalidDetailProductIds(limit: number) {
  let cursor = (await products())
    .find(INVALID_DETAIL_FILTER)
    .project({ productId: 1 })
    .sort({ productId: 1 });
  if (limit > 0) cursor = cursor.limit(limit);
  const docs = await cursor.toArray();
  return docs
    .map((d) => d.productId)
    .filter((id): id is number => typeof id === "number");
}

export function completionFilter(productId: number) {
  return { productId };
}

export async function hasRetryMarker(productId: number, marker: RetryMarker) {
  const doc = await (
    await products()
  ).findOne(completionFilter(productId), { projection: { [marker.field]: 1 } });
  return doc?.[marker.field] === marker.version;
}

export async function markRetryFinished(
  productId: number,
  marker: RetryMarker,
) {
  const result = await (
    await products()
  ).updateOne(completionFilter(productId), {
    $set: { [marker.field]: marker.version },
  });
  return result.matchedCount > 0;
}

export async function upsertProduct(
  productId: number,
  fields: Record<string, unknown>,
  source = "-",
) {
  const storedFields = { ...fields };
  if (Object.hasOwn(fields, "detail")) {
    storedFields.detail = removeUnusedDetailFields(source, fields.detail);
  }

  await (
    await products()
  ).updateOne(
    completionFilter(productId),
    {
      $set: {
        source,
        productId,
        ...storedFields,
        at: new Date(),
      },
    },
    { upsert: true },
  );
}
