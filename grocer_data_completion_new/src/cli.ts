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
    throw new Error(
      "--retry-needs-review and --retry-invalid-detail cannot be used together",
    );
  }

  let defaultLimit = 1;
  if (retryInvalidDetail) defaultLimit = 0;
  const positionalLimit = Number(positionals[0]);
  if (Number.isFinite(positionalLimit) && positionalLimit > 0) {
    defaultLimit = positionalLimit;
  }

  return {
    limit: positive(values.limit, defaultLimit),
    rate: positive(values.rate, 1),
    storeMode: storeMode as StoreMode,
    retryNeedsReview,
    retryInvalidDetail,
    foodstuffsRequestDelay:
      Number.isFinite(delay) && delay >= 0
        ? delay
        : DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS,
  };
}

function positive(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}
