import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCli } from "../src/cli.ts";
import { loadRetryProduct } from "../src/catalog.ts";
import { normalizeBarcode, uniqueBarcodes } from "../src/barcodes.ts";
import { platformCookieUrls } from "../src/crawlers/foodstuffs/headers.ts";
import { foodstuffsSearchPayload } from "../src/crawlers/foodstuffs/payload.ts";
import { DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS } from "../src/crawlers/foodstuffs/request.ts";
import {
  firstFoodstuffsProduct,
  foodstuffsDetailUrl,
} from "../src/crawlers/foodstuffs/search.ts";
import { storesForMode } from "../src/crawlers/foodstuffs/stores.ts";
import type { FoodstuffsStore } from "../src/crawlers/foodstuffs/types.ts";
import { createRetryTask, createTask } from "../src/crawlers/index.ts";
import {
  matchProduct,
  nwNameScore,
  PlatformUnavailableError,
  pnsNameScore,
} from "../src/crawlers/match-product.ts";
import { newWorldPlatform } from "../src/crawlers/new-world/config.ts";
import { paknsavePlatform } from "../src/crawlers/paknsave/config.ts";
import { wwSearchUrl } from "../src/crawlers/woolworth/headers.ts";
import { findWoolworthByBarcode } from "../src/crawlers/woolworth/match.ts";
import { completionFilter, NEEDS_REVIEW_FILTER } from "../src/db.ts";
import { duplicateAbortMessage, planStart } from "../src/start-plan.ts";

const product = {
  id: 1,
  name: "Shin Ramyun Noodle Soup",
  brand: "Nongshim",
  barcodes: ["0009403142000852", "09403142000852", "00015205360002"],
};

const nwStores: FoodstuffsStore[] = [
  {
    id: "3a5fd4b8-6ea0-4a6c-aeec-5af83e093322",
    name: "New World Thorndon",
    region: "NI",
  },
  {
    id: "c1aaac72-38c0-4cc0-ad05-f241047d88c5",
    name: "New World Durham Street",
    region: "SI",
  },
];

const pnsStores: FoodstuffsStore[] = [
  {
    id: "b2e98a14-c8ca-401e-99ed-edf74570c6f6",
    name: "PAK'nSAVE Mt Albert",
    region: "NI",
  },
  {
    id: "90082979-fb9f-4305-9c72-83274fc438cc",
    name: "PAK'nSAVE Dunedin",
    region: "SI",
  },
];

function miss() {
  return {
    status: "no-result" as const,
    resultCount: 0,
    hit: null,
    stage: "search" as const,
    errorMessage: null,
  };
}

function reqError(message = "network") {
  return {
    status: "request-error" as const,
    resultCount: 0,
    hit: null,
    stage: "search" as const,
    errorMessage: message,
  };
}

function detailFail(
  store: FoodstuffsStore,
  sku: string,
  name: string,
  resultCount = 3,
) {
  return {
    status: "detail-error" as const,
    resultCount,
    stage: "detail" as const,
    errorMessage: "detail 503",
    hit: {
      sku,
      name,
      detail: null,
      storeId: store.id,
      storeName: store.name,
    },
  };
}

function fsHit(store: FoodstuffsStore, sku: string, name: string) {
  return {
    status: "matched" as const,
    resultCount: 1,
    hit: {
      sku,
      name,
      detail: { sku, storeId: store.id },
      storeId: store.id,
      storeName: store.name,
    },
  };
}

function baseDeps(overrides: Parameters<typeof matchProduct>[1] extends infer D
  ? Partial<D>
  : never) {
  return {
    searchWw: async () => miss(),
    searchNw: async () => miss(),
    searchPns: async () => miss(),
    nwStores,
    pnsStores,
    ...overrides,
  };
}

test("strips leading zeros from barcodes", () => {
  assert.equal(normalizeBarcode("09403142000852"), "9403142000852");
  assert.equal(normalizeBarcode("00015205360002"), "15205360002");
  assert.equal(normalizeBarcode("00031146030996"), "31146030996");
});

test("dedupes normalized barcodes and keeps first-seen order", () => {
  assert.deepEqual(uniqueBarcodes(product.barcodes), [
    "9403142000852",
    "15205360002",
  ]);
});

test("woolworths first barcode miss then exact hit on second", async () => {
  const ww: string[] = [];
  const result = await matchProduct(
    product,
    baseDeps({
      searchWw: async (code) => {
        ww.push(code);
        if (code === "15205360002") {
          return { sku: "WW-2", detail: { sku: "WW-2" } };
        }
        return miss();
      },
      searchNw: async () => {
        throw new Error("new-world must not run");
      },
      searchPns: async () => {
        throw new Error("paknsave must not run");
      },
    }),
  );
  assert.deepEqual(ww, ["9403142000852", "15205360002"]);
  assert.equal(result.source, "woolworths");
  assert.equal(result.query, "15205360002");
  assert.equal(result.sku, "WW-2");
  assert.equal(result.wwScore, 1000);
  assert.equal(result.needsReview, false);
});

test("woolworths rejects similar name when barcode differs", () => {
  const hit = findWoolworthByBarcode(
    [
      {
        name: "Shin Ramyun Noodle Soup",
        barcode: "111",
        sku: "wrong",
      },
    ],
    "9403142000852",
  );
  assert.equal(hit, undefined);
});

test("woolworths hit skips new-world and paknsave", async () => {
  const ww: string[] = [];
  let nw = 0;
  let pns = 0;
  const result = await matchProduct(
    product,
    baseDeps({
      searchWw: async (code) => {
        ww.push(code);
        return { sku: "WW-1", detail: { ok: true } };
      },
      searchNw: async () => {
        nw++;
        return miss();
      },
      searchPns: async () => {
        pns++;
        return miss();
      },
    }),
  );
  assert.deepEqual(ww, ["9403142000852"]);
  assert.equal(nw, 0);
  assert.equal(pns, 0);
  assert.equal(result.source, "woolworths");
});

test("new-world first store hit skips later stores", async () => {
  const seen: string[] = [];
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store) => {
        seen.push(store.id);
        return fsHit(store, "NW-1", "anything");
      },
      searchPns: async () => {
        throw new Error("paknsave must not run");
      },
    }),
  );
  assert.deepEqual(seen, [nwStores[0].id]);
  assert.equal(result.source, "new-world");
  assert.equal(result.storeId, nwStores[0].id);
  assert.equal(result.storeName, nwStores[0].name);
  assert.equal(result.query, "9403142000852");
});

test("new-world all stores fail then paknsave runs", async () => {
  const nw: string[] = [];
  const pns: string[] = [];
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store, code) => {
        nw.push(`${store.id}:${code}`);
        return miss();
      },
      searchPns: async (store, code) => {
        pns.push(`${store.id}:${code}`);
        return fsHit(store, "PNS-1", "Shin Ramyun");
      },
    }),
  );
  assert.equal(nw.length, nwStores.length * 2);
  assert.deepEqual(pns, [`${pnsStores[0].id}:9403142000852`]);
  assert.equal(result.source, "paknsave");
  assert.equal(result.sku, "PNS-1");
});

test("paknsave hit skips later stores and barcodes", async () => {
  const pns: string[] = [];
  const result = await matchProduct(
    product,
    baseDeps({
      searchPns: async (store, code) => {
        pns.push(`${store.name}:${code}`);
        return fsHit(store, "PNS-STOP", "candidate");
      },
    }),
  );
  assert.deepEqual(pns, [`${pnsStores[0].name}:9403142000852`]);
  assert.equal(result.source, "paknsave");
  assert.equal(result.query, "9403142000852");
  assert.equal(result.storeId, pnsStores[0].id);
});

test("NI store generates NI payload", () => {
  const payload = foodstuffsSearchPayload("9403142000852", nwStores[0]);
  assert.equal(payload.sortOrder, "NI_POPULARITY_ASC");
  assert.deepEqual(payload.algoliaQuery.attributesToRetrieve, [
    "productID",
    "Type",
    "sponsored",
    "category0NI",
    "category1NI",
    "category2NI",
  ]);
  assert.equal(payload.algoliaQuery.facets.includes("category1NI"), true);
  assert.equal(payload.algoliaQuery.facets.includes("category1SI"), false);
  assert.equal(payload.storeId, nwStores[0].id);
  assert.equal(payload.algoliaQuery.query, "9403142000852");
  assert.equal(payload.algoliaQuery.filters, `stores:${nwStores[0].id}`);
});

test("SI store generates SI payload", () => {
  const payload = foodstuffsSearchPayload("9403142000852", nwStores[1]);
  assert.equal(payload.sortOrder, "SI_POPULARITY_ASC");
  assert.ok(payload.algoliaQuery.attributesToRetrieve.includes("category0SI"));
  assert.ok(payload.algoliaQuery.facets.includes("category1SI"));
  assert.equal(payload.storeId, nwStores[1].id);
  assert.equal(payload.algoliaQuery.filters, `stores:${nwStores[1].id}`);
});

test("detail url uses the matched store id", () => {
  const url = foodstuffsDetailUrl(
    "https://api-prod.newworld.co.nz",
    "c1aaac72-38c0-4cc0-ad05-f241047d88c5",
    "SKU-9",
  );
  assert.equal(
    url,
    "https://api-prod.newworld.co.nz/v1/edge/store/c1aaac72-38c0-4cc0-ad05-f241047d88c5/product/SKU-9",
  );
});

test("new-world non-empty products unconditionally takes the first item", () => {
  const first = firstFoodstuffsProduct([
    { productId: "FIRST", name: "unrelated" },
    { productId: "SECOND", name: "Shin Ramyun Noodle Soup" },
  ]);
  assert.equal(first?.productId, "FIRST");
});

test("nwScore uses only source name and candidate name", async () => {
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store) =>
        fsHit(store, "NW-LOW", "Totally Different Product"),
    }),
  );
  assert.equal(result.source, "new-world");
  assert.equal(result.needsReview, false);
  assert.equal(
    result.nwScore,
    nwNameScore(product.name, "Totally Different Product"),
  );
  assert.ok((result.nwScore ?? 100) < 50);
  assert.equal(nwNameScore.length, 2);
});

test("pnsScore uses only source name and candidate name", async () => {
  const result = await matchProduct(
    product,
    baseDeps({
      searchPns: async (store) =>
        fsHit(store, "PNS-LOW", "Totally Different Product"),
    }),
  );
  assert.equal(result.source, "paknsave");
  assert.equal(
    result.pnsScore,
    pnsNameScore(product.name, "Totally Different Product"),
  );
  assert.equal(result.nwScore, 0);
  assert.equal(pnsNameScore.length, 2);
});

test("successful match payload has required fields and no grocer/productUrl", async () => {
  const result = await matchProduct(
    product,
    baseDeps({
      searchWw: async () => ({ sku: "102301", detail: { sku: "102301" } }),
    }),
  );
  assert.equal(result.productId, 1);
  assert.equal(result.query, "9403142000852");
  assert.equal(result.product_name, "Shin Ramyun Noodle Soup");
  assert.equal(result.brand, "Nongshim");
  assert.equal(result.source, "woolworths");
  assert.equal(result.sku, "102301");
  assert.deepEqual(result.detail, { sku: "102301" });
  assert.equal(result.wwScore, 1000);
  assert.equal("grocer" in result, false);
  assert.equal("productUrl" in result, false);
});

test("all failures set needsReview and record attempts", async () => {
  const result = await matchProduct(product, baseDeps({}));
  assert.equal(result.source, "-");
  assert.equal(result.needsReview, true);
  assert.equal(result.query, null);
  assert.equal(result.sku, null);
  assert.equal(result.wwScore, 0);
  assert.equal(result.nwScore, 0);
  assert.equal(result.pnsScore, 0);
  assert.equal(result.detail, null);
  assert.equal(result.attempts.length, 2 + nwStores.length * 2 + pnsStores.length * 2);
  assert.ok(result.attempts.every((a) => a.status === "no-result"));
  assert.ok(result.attempts.some((a) => a.source === "woolworths"));
  assert.ok(result.attempts.some((a) => a.source === "new-world"));
  assert.ok(result.attempts.some((a) => a.source === "paknsave"));
  assert.ok(result.attempts.some((a) => a.storeName === "New World Thorndon"));
  assert.ok(result.attempts.some((a) => a.storeName === "PAK'nSAVE Dunedin"));
});

test("retailer search query is the barcode not the product name", () => {
  const code = "9403142000852";
  const ww = wwSearchUrl(code);
  assert.ok(ww.includes(code));
  assert.equal(new URL(ww).searchParams.get("search"), code);
  assert.equal(ww.toLowerCase().includes("shin"), false);
  assert.equal(foodstuffsSearchPayload(code, nwStores[0]).algoliaQuery.query, code);
});

test("empty barcodes skip search and needsReview", async () => {
  let calls = 0;
  const result = await matchProduct(
    { id: 9, name: "x", brand: null, barcodes: ["000", ""] },
    baseDeps({
      searchWw: async () => {
        calls++;
        return miss();
      },
      searchNw: async () => {
        calls++;
        return miss();
      },
      searchPns: async () => {
        calls++;
        return miss();
      },
    }),
  );
  assert.equal(calls, 0);
  assert.equal(result.needsReview, true);
  assert.equal(result.source, "-");
  assert.deepEqual(result.attempts, []);
});

test("same productId upsert overwrites instead of inserting a second row", () => {
  assert.deepEqual(completionFilter(1), { productId: 1 });
  type Doc = { productId: number; source: string };
  const docs: Doc[] = [];
  const upsert = (productId: number, source: string) => {
    const filter = completionFilter(productId);
    const i = docs.findIndex((d) => d.productId === filter.productId);
    if (i >= 0) docs[i] = { productId, source };
    else docs.push({ productId, source });
  };
  upsert(1, "-");
  upsert(1, "new-world");
  assert.equal(docs.length, 1);
  assert.equal(docs[0].source, "new-world");
});

test("CLI keeps limit/rate and defaults store-mode to fast", () => {
  assert.deepEqual(parseCli(["node", "src/index.ts", "--limit", "3", "--rate", "2"]), {
    limit: 3,
    rate: 2,
    storeMode: "fast",
    retryNeedsReview: false,
    foodstuffsRequestDelay: DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS,
    ensureUniqueProductId: false,
  });
  assert.equal(parseCli(["node", "src/index.ts", "5"]).limit, 5);
  assert.equal(
    parseCli(["node", "src/index.ts", "--store-mode", "expanded"]).storeMode,
    "expanded",
  );
  assert.equal(parseCli(["node", "src/index.ts"]).storeMode, "fast");
  assert.equal(
    parseCli(["node", "src/index.ts", "--store-mode=expanded"]).storeMode,
    "expanded",
  );
  assert.throws(
    () => parseCli(["node", "src/index.ts", "--store-mode", "nope"]),
    /store-mode/,
  );
});

test("fast store mode uses the shortlists, expanded uses full lists", () => {
  const nwFast = storesForMode(newWorldPlatform, "fast");
  const pnsFast = storesForMode(paknsavePlatform, "fast");
  assert.deepEqual(
    nwFast.map((s) => s.name),
    ["New World Thorndon", "New World Durham Street"],
  );
  assert.deepEqual(
    pnsFast.map((s) => s.name),
    ["PAK'nSAVE Mt Albert", "PAK'nSAVE Dunedin"],
  );
  assert.equal(storesForMode(newWorldPlatform, "expanded").length, 6);
  assert.equal(storesForMode(paknsavePlatform, "expanded").length, 5);
  assert.equal(
    storesForMode(newWorldPlatform, "expanded").at(-1)?.name,
    "New World Rolleston",
  );
});

test("default mode continues after latestProductId", () => {
  const plan = planStart({
    retryNeedsReview: false,
    latestProductId: 3623,
    retryIds: [1, 2],
    duplicates: { count: 0, examples: [] },
  });
  assert.equal(plan.abort, false);
  if (plan.abort) throw new Error("unreachable");
  assert.equal(plan.mode, "incremental");
  assert.equal(plan.afterId, 3623);
  assert.equal(createTask(3623, 2, 2).userData.afterId, 3623);
});

test("parses --retry-needs-review", () => {
  const cli = parseCli([
    "node",
    "src/index.ts",
    "--retry-needs-review",
    "--limit",
    "100",
    "--rate",
    "2",
    "--store-mode",
    "fast",
  ]);
  assert.equal(cli.retryNeedsReview, true);
  assert.equal(cli.limit, 100);
  assert.equal(cli.rate, 2);
  assert.equal(cli.storeMode, "fast");
});

test("retry mode only reads needsReview true", () => {
  assert.equal(NEEDS_REVIEW_FILTER.needsReview, true);
  const plan = planStart({
    retryNeedsReview: true,
    latestProductId: 9999,
    retryIds: [10, 20],
    duplicates: { count: 0, examples: [] },
  });
  assert.equal(plan.abort, false);
  if (plan.abort) throw new Error("unreachable");
  assert.equal(plan.mode, "retry");
  assert.deepEqual(plan.retryIds, [10, 20]);
  assert.equal("afterId" in plan, false);
});

test("retry mode loads supabase product by productId", async () => {
  const seen: number[] = [];
  const loaded = await loadRetryProduct(42, async (id) => {
    seen.push(id);
    return { id, name: "x", brand: null, barcodes: ["1"] };
  });
  assert.deepEqual(seen, [42]);
  assert.equal(loaded.skip, false);
  assert.equal(loaded.product?.id, 42);
});

test("retry success overwrites the same productId", () => {
  type Doc = { productId: number; source: string; needsReview: boolean };
  const docs: Doc[] = [{ productId: 7, source: "-", needsReview: true }];
  const upsert = (productId: number, source: string, needsReview: boolean) => {
    const i = docs.findIndex((d) => d.productId === completionFilter(productId).productId);
    const next = { productId, source, needsReview };
    if (i >= 0) docs[i] = next;
    else docs.push(next);
  };
  upsert(7, "paknsave", false);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].source, "paknsave");
  assert.equal(docs[0].needsReview, false);
});

test("missing supabase product skips without throwing", async () => {
  const loaded = await loadRetryProduct(99, async () => null);
  assert.equal(loaded.skip, true);
  assert.equal(loaded.product, null);
});

test("single request-error continues to the next store", async () => {
  const seen: string[] = [];
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store) => {
        seen.push(store.name);
        if (store.id === nwStores[0].id) return reqError("401");
        return fsHit(store, "NW-2", "ok");
      },
      searchPns: async () => {
        throw new Error("paknsave must not run");
      },
    }),
  );
  assert.deepEqual(seen, ["New World Thorndon", "New World Durham Street"]);
  assert.equal(result.source, "new-world");
  assert.equal(result.storeId, nwStores[1].id);
});

test("all request-error on a platform throws platform error", async () => {
  let pns = 0;
  await assert.rejects(
    () =>
      matchProduct(
        product,
        baseDeps({
          searchNw: async () => reqError("down"),
          searchPns: async () => {
            pns++;
            return miss();
          },
        }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof PlatformUnavailableError);
      assert.equal(err.source, "new-world");
      assert.equal(err.productId, 1);
      assert.match(err.message, /productId=1/);
      assert.match(err.message, /source=new-world/);
      assert.match(err.message, /storeName=New World Durham Street/);
      assert.match(err.message, /barcode=/);
      return true;
    },
  );
  assert.equal(pns, 0);
});

test("normal no-result is not a platform outage", async () => {
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store, code) => {
        if (store.id === nwStores[0].id && code === "9403142000852") {
          return reqError("timeout");
        }
        return miss();
      },
      searchPns: async (store) => fsHit(store, "PNS-OK", "ok"),
    }),
  );
  assert.equal(result.source, "paknsave");
  assert.equal(result.needsReview, false);
});

test("detail-error keeps search candidate fields", async () => {
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store) => {
        if (store.id === nwStores[0].id) {
          return detailFail(store, "NW-DET", "Shin cup", 4);
        }
        return miss();
      },
      searchPns: async (store) => fsHit(store, "PNS-1", "ok"),
    }),
  );
  const det = result.attempts.find((a) => a.status === "detail-error");
  assert.ok(det);
  assert.equal(det.resultCount, 4);
  assert.equal(det.sku, "NW-DET");
  assert.equal(det.candidateName, "Shin cup");
  assert.equal(det.storeId, nwStores[0].id);
  assert.equal(det.storeName, nwStores[0].name);
  assert.equal(det.stage, "detail");
  assert.equal(result.source, "paknsave");
});

test("detail-error continues fallback", async () => {
  const pns: string[] = [];
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store) => {
        if (store.id === nwStores[0].id) return detailFail(store, "X", "y");
        return miss();
      },
      searchPns: async (store) => {
        pns.push(store.name);
        return fsHit(store, "PNS-FB", "ok");
      },
    }),
  );
  assert.ok(pns.length > 0);
  assert.equal(result.source, "paknsave");
  assert.equal(result.sku, "PNS-FB");
});

test("all detail-error on a platform throws", async () => {
  await assert.rejects(
    () =>
      matchProduct(
        product,
        baseDeps({
          searchNw: async (store) => detailFail(store, "X", "y"),
          searchPns: async () => miss(),
        }),
      ),
    PlatformUnavailableError,
  );
});

test("new-world and paknsave cookie urls are isolated", () => {
  const nw = platformCookieUrls(newWorldPlatform);
  const pns = platformCookieUrls(paknsavePlatform);
  assert.deepEqual(nw, [
    "https://www.newworld.co.nz",
    "https://api-prod.newworld.co.nz",
  ]);
  assert.deepEqual(pns, [
    "https://www.paknsave.co.nz",
    "https://api-prod.paknsave.co.nz",
  ]);
  assert.equal(nw.some((u) => pns.includes(u)), false);
  assert.equal(newWorldPlatform.headerKey, "nwHeaders");
  assert.equal(paknsavePlatform.headerKey, "paknsaveHeaders");
});

test("foodstuffs searches barcode then store", async () => {
  const calls: string[] = [];
  await matchProduct(
    product,
    baseDeps({
      searchNw: async (store, code) => {
        calls.push(`${code}:${store.name}`);
        return miss();
      },
    }),
  );
  assert.deepEqual(calls, [
    "9403142000852:New World Thorndon",
    "9403142000852:New World Durham Street",
    "15205360002:New World Thorndon",
    "15205360002:New World Durham Street",
  ]);
});

test("hit stops later barcodes stores and platforms", async () => {
  const nw: string[] = [];
  let pns = 0;
  const result = await matchProduct(
    product,
    baseDeps({
      searchNw: async (store, code) => {
        nw.push(`${code}:${store.name}`);
        return fsHit(store, "STOP", "ok");
      },
      searchPns: async () => {
        pns++;
        return miss();
      },
    }),
  );
  assert.deepEqual(nw, ["9403142000852:New World Thorndon"]);
  assert.equal(pns, 0);
  assert.equal(result.source, "new-world");
});

test("duplicate productId check aborts retry without deleting", () => {
  const dups = { count: 2, examples: [11, 22] };
  const plan = planStart({
    retryNeedsReview: true,
    latestProductId: 0,
    retryIds: [11],
    duplicates: dups,
  });
  assert.equal(plan.abort, true);
  const msg = duplicateAbortMessage(dups);
  assert.match(msg, /do not auto-delete/);
  assert.match(msg, /11,22/);
});

test("programming errors are not turned into needsReview", async () => {
  await assert.rejects(
    () =>
      matchProduct(
        product,
        baseDeps({
          searchWw: async () => {
            throw new TypeError("boom");
          },
        }),
      ),
    TypeError,
  );
});

test("retry task uniqueKey uses productId not latestProductId", () => {
  const task = createRetryTask([5, 9], 2, 2);
  assert.equal(task.userData.retry, true);
  assert.equal(task.uniqueKey, "retry:5:2");
  assert.deepEqual(task.userData.retryIds, [5, 9]);
});

