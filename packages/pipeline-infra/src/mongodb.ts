import { MongoClient } from "mongodb";
export type { Filter, Document } from "mongodb";

/** 支持标准 /database 及兼容 /database/collection URI；不输出连接凭证。 */
export function parseMongoConnection(raw = process.env.MONGODB_URI) {
  if (!raw?.trim()) throw new Error("MONGODB_URI missing");
  const uri = new URL(raw.trim());
  const [database, collectionName = "data_completion"] = uri.pathname
    .split("/")
    .filter(Boolean);
  if (!database) throw new Error("MONGODB_URI must include a database name");
  uri.pathname = `/${database}`;
  return { uri: uri.toString(), database, collectionName };
}

/** 仅构造连接；命令显式 connect/close，不在导入时读取数据或连接 MongoDB。 */
export function createDatabaseConnection(raw = process.env.MONGODB_URI) {
  const parsed = parseMongoConnection(raw);
  const client = new MongoClient(parsed.uri, {
    serverSelectionTimeoutMS: 10000,
  });
  return {
    client,
    db: client.db(parsed.database),
    collectionName: parsed.collectionName,
  };
}
