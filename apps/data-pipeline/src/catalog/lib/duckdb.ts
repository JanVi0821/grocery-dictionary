import { execFileSync, spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

export function queryDuckDb<T>(databaseFile: string, sql: string): T[] {
  const output = execFileSync("duckdb", ["-readonly", databaseFile, "-json", sql], {
    encoding: "utf8",
  }).trim();
  return JSON.parse(output || "[]") as T[];
}

export function validateDuckDb(databaseFile: string): void {
  execFileSync("duckdb", ["-readonly", databaseFile, "SELECT count(*) FROM public_meta;"], {
    stdio: "ignore",
  });
}

export function streamDuckDbJson(
  databaseFile: string,
  query: string,
  label: string,
): { lines: Interface; done: Promise<void> } {
  const child = spawn(
    "duckdb",
    ["-readonly", databaseFile, `COPY (${query}) TO STDOUT (FORMAT JSON)`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label}: ${stderr.trim()}`));
    });
  });
  return {
    lines: createInterface({ input: child.stdout, crlfDelay: Infinity }),
    done,
  };
}
