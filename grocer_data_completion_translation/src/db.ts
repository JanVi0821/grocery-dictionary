import { MongoClient } from 'mongodb';

/** Accept the existing crawler URI format: /database/collection. */
export function createDatabaseConnection(raw = process.env.MONGODB_URI) {
  if (!raw?.trim()) throw new Error('MONGODB_URI missing');
  const uri = new URL(raw.trim());
  const [database] = uri.pathname.split('/').filter(Boolean);
  if (!database) throw new Error('MONGODB_URI must include a database name');
  uri.pathname = `/${database}`;
  const client = new MongoClient(uri.toString(), { serverSelectionTimeoutMS: 10000 });
  return { client, db: client.db(database) };
}
