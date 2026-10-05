import { parseArgs } from "node:util";
import { DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS } from "./crawlers/foodstuffs/request.ts";
import type { StoreMode } from "./crawlers/foodstuffs/stores.ts";

export { DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS };

export function parseCli(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      limit: { type: "string" },
      rate: { type: "string" },
      "store-mode": { type: "string", default: "fast" },
      "retry-needs-review": { type: "boolean", default: false },
      "retry-invalid-detail": { type: "boolean", default: false },
      "foodstuffs-request-delay": { type: "string" },
      "ensure-unique-productId": { type: "boolean", default: false },
    },
  });

  const storeMode = values["store-mode"];
  if (storeMode !== "fast" && storeMode !== "expanded") {
    throw new Error(`--store-mode must be fast or expanded, got ${storeMode}`);
  }

  const delay = Number(values["foodstuffs-request-delay"]);
  const retryNeedsReview = values["retry-needs-review"];
  const retryInvalidDetail = values["retry-invalid-detail"];
  if (retryNeedsReview && retryInvalidDetail) {
    throw new Error("--retry-needs-review and --retry-invalid-detail cannot be used together");
  }

  return {
    limit: positive(
      values.limit,
      Number(positionals[0]) || (retryInvalidDetail ? 0 : 1),
    ),
    rate: positive(values.rate, 1),
    storeMode: storeMode as StoreMode,
    retryNeedsReview,
    retryInvalidDetail,
    foodstuffsRequestDelay:
      Number.isFinite(delay) && delay >= 0
        ? delay
        : DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS,
    ensureUniqueProductId: values["ensure-unique-productId"],
  };
}

function positive(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
