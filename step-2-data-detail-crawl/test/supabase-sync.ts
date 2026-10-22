import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../fe/src/types/generated/database.types.ts";
import { syncProductDetail } from "../src/supabase-sync.ts";

test("sync fully replaces one product detail on reruns without copying metadata or changing base fields", async () => {
  const requests: { url: URL; body: unknown; method: string }[] = [];
  const supabase = createClient<Database>("https://sync.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requests.push({
          url: new URL(String(input)),
          body: JSON.parse(String(init?.body)),
          method: init?.method ?? "GET",
        });
        return new Response(JSON.stringify([{ id: 42 }]), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const original = {
    productId: 42,
    source: "new-world",
    product_name: "Milk",
    brand: "Anchor",
    sku: "123",
    attempts: [],
    query: "123",
    retryAllVersion: 1,
    detail: { name: "Milk", availability: "in-stock", price: { value: 4 } },
  };
  await syncProductDetail(supabase, original);
  await syncProductDetail(supabase, {
    ...original,
    detail: { name: "Updated" },
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.method, "PATCH");
    assert.equal(request.url.pathname, "/rest/v1/products");
    assert.equal(request.url.searchParams.get("id"), "eq.42");
    assert.equal(request.url.searchParams.get("select"), "id");
  }
  assert.deepEqual(requests[0].body, {
    detail: { source: "new-world", detail: { name: "Milk" } },
  });
  assert.deepEqual(requests[1].body, {
    detail: { source: "new-world", detail: { name: "Updated" } },
  });
  assert.equal(original.detail.availability, "in-stock");
  assert.ok(original.detail.price);
});

test("invalid data, missing products and API failures fail instead of creating incomplete products", async () => {
  let calls = 0;
  let status = 200;
  const supabase = createClient<Database>("https://sync.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async () => {
        calls++;
        return new Response(
          status === 200
            ? "[]"
            : JSON.stringify({ message: "permission denied" }),
          { status, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  });
  const row = { productId: 42, source: "new-world", detail: { name: "Milk" } };
  await assert.rejects(
    syncProductDetail(supabase, { ...row, productId: 0 }),
    /Invalid productId/,
  );
  await assert.rejects(
    syncProductDetail(supabase, { ...row, detail: "<html>error</html>" }),
    /invalid source or detail/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    syncProductDetail(supabase, row),
    /No products.id match/,
  );
  status = 403;
  await assert.rejects(syncProductDetail(supabase, row), /permission denied/);
  assert.equal(calls, 2);
});
