import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const messagesDirectory = new URL("../messages/", import.meta.url);

async function readMessages(locale) {
  return JSON.parse(
    await readFile(new URL(`${locale}.json`, messagesDirectory), "utf8"),
  );
}

function collectKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null
      ? collectKeys(child, path)
      : path;
  });
}

test("all locales provide the same message keys", async () => {
  const [english, simplifiedChinese] = await Promise.all([
    readMessages("en"),
    readMessages("zh"),
  ]);

  assert.deepEqual(collectKeys(simplifiedChinese), collectKeys(english));
});
