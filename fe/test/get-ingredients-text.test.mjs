import assert from "node:assert/strict";
import test from "node:test";
import { getIngredientsText } from "../src/utils/get-ingredients-text.ts";

test("formats structured ingredients for display", () => {
  assert.equal(
    getIngredientsText([{ text: "Sugar" }, { text: " Milk " }, { id: "en:salt" }]),
    "Sugar, Milk",
  );
  assert.equal(getIngredientsText(null), null);
});
