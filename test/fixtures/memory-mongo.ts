/** Offline MongoDB subset for exercising job state transitions; not a production database adapter. */
import { BSON, ObjectId, type Db, type Document } from "mongodb";
import { isDeepStrictEqual } from "node:util";

const clone = <T extends Document>(row: T): T =>
  BSON.deserialize(BSON.serialize(row)) as T;
const valueAt = (row: Document, key: string) =>
  key.split(".").reduce((value, part) => value?.[part], row);
const comparable = (value: unknown): any =>
  value instanceof ObjectId ? value.toHexString() : value;

function matches(row: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$and")
      return expected.every((item: Document) => matches(row, item));
    if (key === "$or")
      return expected.some((item: Document) => matches(row, item));
    const actual = valueAt(row, key);
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof ObjectId) &&
      !(expected instanceof Date)
    ) {
      return Object.entries(expected).every(([operator, operand]) => {
        if (operator === "$exists") return (actual !== undefined) === operand;
        if (operator === "$gt") return comparable(actual) > comparable(operand);
        if (operator === "$gte")
          return comparable(actual) >= comparable(operand);
        if (operator === "$lte")
          return comparable(actual) <= comparable(operand);
        if (operator === "$ne") return !isDeepStrictEqual(actual, operand);
        if (operator === "$in")
          return (operand as unknown[]).some((item) =>
            isDeepStrictEqual(actual, item),
          );
        throw new Error(`Unsupported test query operator: ${operator}`);
      });
    }
    return isDeepStrictEqual(actual, expected);
  });
}

export function memoryDatabase() {
  const collections = new Map<string, ReturnType<typeof makeCollection>>();
  function makeCollection(name: string) {
    const rows = new Map<string, Document>();
    const apply = (row: Document, update: Document) => {
      Object.assign(row, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {})) delete row[key];
      for (const [key, amount] of Object.entries(update.$inc ?? {}))
        row[key] = (row[key] ?? 0) + Number(amount);
    };
    const selected = (filter: Document, sort?: Document) => {
      const found = [...rows.values()].filter((row) => matches(row, filter));
      if (sort)
        found.sort((a, b) => {
          for (const [key, direction] of Object.entries(sort)) {
            const left = comparable(a[key]),
              right = comparable(b[key]);
            if (left !== right)
              return (left < right ? -1 : 1) * Number(direction);
          }
          return 0;
        });
      return found;
    };
    const api = {
      collectionName: name,
      rows,
      fault: undefined as
        | ((operation: string, filter: Document, update?: Document) => void)
        | undefined,
      async createIndex() {
        return "index";
      },
      find(filter: Document) {
        api.fault?.("find", filter);
        let sort: Document | undefined,
          limit = Infinity;
        const cursor = {
          sort(value: Document) {
            sort = value;
            return cursor;
          },
          limit(value: number) {
            limit = value;
            return cursor;
          },
          async toArray() {
            return selected(filter, sort).slice(0, limit).map(clone);
          },
        };
        return cursor;
      },
      async findOne(filter: Document) {
        api.fault?.("findOne", filter);
        const row = selected(filter)[0];
        return row ? clone(row) : null;
      },
      async updateOne(filter: Document, update: Document, options?: Document) {
        api.fault?.("updateOne", filter, update);
        let row = selected(filter)[0];
        if (!row && options?.upsert) {
          row = clone({ _id: filter._id, ...update.$setOnInsert });
          rows.set(String(row._id), row);
        }
        if (!row) return { matchedCount: 0, modifiedCount: 0 };
        apply(row, update);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      async updateMany(filter: Document, update: Document) {
        api.fault?.("updateMany", filter, update);
        const found = selected(filter);
        for (const row of found) apply(row, update);
        return { matchedCount: found.length, modifiedCount: found.length };
      },
      async findOneAndUpdate(
        filter: Document,
        update: Document,
        options?: Document,
      ) {
        api.fault?.("findOneAndUpdate", filter, update);
        const row = selected(filter, options?.sort)[0];
        if (!row) return null;
        apply(row, update);
        return clone(row);
      },
      async bulkWrite(operations: Document[]) {
        for (const { updateOne } of operations)
          await api.updateOne(updateOne.filter, updateOne.update, {
            upsert: updateOne.upsert,
          });
      },
      aggregate(pipeline: Document[]) {
        const found = selected(pipeline[0].$match);
        const groups = new Map<string, number>();
        for (const row of found)
          groups.set(row.status, (groups.get(row.status) ?? 0) + 1);
        return {
          toArray: async () =>
            [...groups].map(([_id, count]) => ({ _id, count })),
        };
      },
    };
    return api;
  }
  const collection = (name: string) => {
    if (!collections.has(name)) collections.set(name, makeCollection(name));
    return collections.get(name)!;
  };
  return {
    db: { databaseName: "test", collection } as unknown as Db,
    collection,
  };
}
