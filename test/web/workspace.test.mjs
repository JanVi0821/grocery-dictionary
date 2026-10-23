import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("web owns its routes and consumes only the public model workspace package", () => {
  const root = new URL("../../", import.meta.url);
  const pkg = JSON.parse(readFileSync(new URL("apps/web/package.json", root), "utf8"));
  assert.equal(pkg.name, "@grocery/web");
  assert.equal(pkg.dependencies["@grocery/product-model"], "workspace:*");
  assert.equal(pkg.dependencies["@grocery/pipeline-infra"], undefined);
  const detail = readFileSync(new URL("apps/web/src/types/grocer-detail.ts", root), "utf8");
  assert.match(detail, /@grocery\/product-model\/grocer-detail/);
});
