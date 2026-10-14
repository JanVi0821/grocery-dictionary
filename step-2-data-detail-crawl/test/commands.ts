import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createTask,
  createRetryTask,
  createInvalidDetailRetryTask,
} from "../src/crawlers/tasks.ts";

test("three commands have independent entries and task labels without mode flags", () => {
  const { scripts } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.match(scripts["crawl:10000"], /src\/command\/incremental\.ts/);
  assert.match(scripts["retry:all"], /src\/command\/retry-all\.ts/);
  assert.match(
    scripts["retry:invalid-detail"],
    /src\/command\/retry-invalid-detail\.ts/,
  );
  for (const command of ["crawl:10000", "retry:all", "retry:invalid-detail"]) {
    assert.doesNotMatch(scripts[command], /--retry-/);
  }
  const incremental = createTask(100, 3, 3);
  const retry = createRetryTask([11, 22, 33], 2, 3);
  const invalid = createInvalidDetailRetryTask([11, 22, 33], 2, 3);
  assert.equal(
    new Set([incremental.label, retry.label, invalid.label]).size,
    3,
  );
  assert.equal(incremental.userData.afterId, 100);
  assert.equal(retry.uniqueKey, "retry:22:2");
  assert.equal(invalid.uniqueKey, "retry-invalid-detail:22:2");
  for (const request of [incremental, retry, invalid]) {
    assert.equal(request.skipNavigation, true);
    assert.equal(Object.hasOwn(request.userData, "retry"), false);
    assert.equal(Object.hasOwn(request.userData, "retryInvalidDetail"), false);
  }
});
