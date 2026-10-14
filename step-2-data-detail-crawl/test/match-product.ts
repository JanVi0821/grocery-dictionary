import test from "node:test";
import assert from "node:assert/strict";
import { matchProduct } from "../src/crawlers/match-product.ts";

test("all results omit root query while attempts preserve every searched barcode", async () => {
  const store = { id: "store", name: "Test store", region: "NI" as const };
  for (const source of ["woolworths", "new-world", "paknsave", "-"]) {
    const search = async (platform: string) =>
      platform === source
        ? {
            sku: "1",
            detail: { name: "Milk" },
            storeId: store.id,
            storeName: store.name,
          }
        : null;
    const result = await matchProduct(
      { id: 1, name: "Milk", brand: null, barcodes: ["000123"] },
      {
        searchWw: async () => search("woolworths"),
        searchNw: async () => search("new-world"),
        searchPns: async () => search("paknsave"),
        nwStores: [store],
        pnsStores: [store],
      },
    );
    assert.equal(result.source, source);
    assert.equal(Object.hasOwn(result, "query"), false);
    assert.ok(result.attempts.length > 0);
    assert.ok(result.attempts.every((attempt) => attempt.barcode === "123"));
  }
});
