import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseCurlHeaders(curl: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const m of curl.matchAll(/-H\s+'([^']*)'/g)) {
    const i = m[1].indexOf(":");
    if (i < 0) continue;
    headers[m[1].slice(0, i).trim().toLowerCase()] = m[1].slice(i + 1).trim();
  }
  const cookie = curl.match(/-b\s+\$?'([^']*)'/);
  if (cookie) {
    headers.cookie = cookie[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }
  return headers;
}

export function loadCurlHeaders(filename: string) {
  const headers = parseCurlHeaders(
    readFileSync(join(import.meta.dirname, filename), "utf8"),
  );
  if (!headers.authorization) {
    throw new Error(`src/auth/${filename} is missing authorization`);
  }
  return headers;
}
