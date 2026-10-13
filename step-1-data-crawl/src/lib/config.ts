import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const DATABASE_FILE = path.join(PROJECT_ROOT, "base_v3.duckdb");
export const DEFAULT_SOURCE_URL =
  "https://assets-prod.grocer.nz/public/base_v3.duckdb.br";

try {
  process.loadEnvFile(path.join(PROJECT_ROOT, ".env"));
} catch (error: unknown) {
  if (!isNodeError(error) || error.code !== "ENOENT") throw error;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing ${name} in ${path.join(PROJECT_ROOT, ".env")}`);
  return value;
}

export function mongoUri(): string {
  return (
    process.env.MONGODB_URI ??
    process.env.MONGO_URI ??
    "mongodb://127.0.0.1:27017"
  );
}

export function dateInAuckland(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

export function defaultFullSyncDatabase(date = new Date()): string {
  return `grocer_data_${dateInAuckland(date)}`;
}

export function validateMongoDatabaseName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("MongoDB database name cannot be empty");
  if (trimmed.length >= 64)
    throw new Error("MongoDB database name must be shorter than 64 bytes");
  if (/[\\/\. "$*<>:|?\0]/u.test(trimmed)) {
    throw new Error(`Invalid MongoDB database name: ${trimmed}`);
  }
  return trimmed;
}

export function databaseArgument(args: readonly string[]): string | undefined {
  const inline = args.find((argument) => argument.startsWith("--database="));
  if (inline) {
    return validateMongoDatabaseName(inline.slice("--database=".length));
  }

  const index = args.indexOf("--database");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--database requires a database name");
  }
  return validateMongoDatabaseName(value);
}

export function positiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return number;
}

export function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Expected a non-negative integer, received: ${value}`);
  }
  return number;
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
