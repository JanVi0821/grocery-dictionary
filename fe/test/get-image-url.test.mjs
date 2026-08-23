import assert from "node:assert/strict";
import test from "node:test";
import { getImageUrl } from "../src/utils/get-image-url.ts";

test("builds an Open Food Facts image URL with the largest size", () => {
  assert.equal(
    getImageUrl({
      code: "93566803",
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

test("prefers the selected image revision and full-size image", () => {
  assert.equal(
    getImageUrl({
      code: "0000998844013",
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
    }),
    "https://images.openfoodfacts.org/images/products/000/099/884/4013/front_en.4.full.jpg",
  );
});

test("returns null for unsupported or incomplete image sources", () => {
  assert.equal(getImageUrl({ code: "123", source: "other", image: {} }), null);
  assert.equal(getImageUrl({ code: "123", source: "openfoodfacts", image: {} }), null);
});
