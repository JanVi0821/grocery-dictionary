import assert from "node:assert/strict";
import test from "node:test";
import { getImageUrl } from "../src/utils/get-image-url.ts";

test("builds an image URL from a native 13-digit barcode", () => {
  assert.equal(
    getImageUrl({
      barcodes: ["0000093566803"],
      source: "openfoodfacts",
      image: {
        front: {
          imgid: "3",
          sizes: {
            100: { h: 100, w: 50 },
            400: { h: 400, w: 200 },
          },
        },
      },
    }),
    "https://images.openfoodfacts.org/images/products/000/009/356/6803/front_en.3.400.jpg",
  );
});

test("removes one padding zero from a 14-digit normalized barcode", () => {
  assert.equal(
    getImageUrl({
      barcodes: ["00000093566803"],
      source: "openfoodfacts",
      image: { front: { imgid: "3", sizes: { 100: {} } } },
    }),
    "https://images.openfoodfacts.org/images/products/000/009/356/6803/front_en.3.100.jpg",
  );
});

test("prefers the selected image revision and full-size image", () => {
  assert.equal(
    getImageUrl(
      {
        barcodes: ["00000998844013"],
        source: "openfoodfacts",
        image: {
          front: {
            imgid: "1",
            rev: "4",
            sizes: {
              400: { h: 400, w: 200 },
              full: { h: 3728, w: 1866 },
            },
          },
        },
      },
      { isFullSize: true },
    ),
    "https://images.openfoodfacts.org/images/products/000/099/884/4013/front_en.4.full.jpg",
  );
});

test("preserves a native 14-digit barcode in the image path", () => {
  assert.equal(
    getImageUrl({
      barcodes: ["89403142003125"],
      source: "openfoodfacts",
      image: { front: { rev: "2", sizes: { 100: {} } } },
    }),
    "https://images.openfoodfacts.org/images/products/894/031/420/03125/front_en.2.100.jpg",
  );
});

test("preserves a barcode longer than 14 digits", () => {
  assert.equal(
    getImageUrl({
      barcodes: ["12345678901234567"],
      source: "openfoodfacts",
      image: { front: { rev: "5", sizes: { 100: {} } } },
    }),
    "https://images.openfoodfacts.org/images/products/123/456/789/01234567/front_en.5.100.jpg",
  );
});

test("uses only the first barcode for an Open Food Facts image", () => {
  assert.equal(
    getImageUrl({
      barcodes: ["invalid", "0000093566803"],
      source: "openfoodfacts",
      image: { front: { rev: "1", sizes: { 100: {} } } },
    }),
    null,
  );
});

test("builds a Grocer image URL from image.id", () => {
  assert.equal(
    getImageUrl({
      barcodes: ["09421019000000"],
      source: "grocer",
      image: { id: 20521 },
    }),
    "https://assets-prod.grocer.nz/public/product_images/product_20521.avif",
  );
});

test("returns null for unsupported or incomplete image sources", () => {
  assert.equal(getImageUrl({ barcodes: ["00000000000123"], source: "other", image: {} }), null);
  assert.equal(
    getImageUrl({ barcodes: ["00000000000123"], source: "openfoodfacts", image: {} }),
    null,
  );
  assert.equal(
    getImageUrl({ barcodes: ["09421019000000"], source: "grocer", image: {} }),
    null,
  );
});
