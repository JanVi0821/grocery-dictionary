import { parseArgs } from "node:util";
import { DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS } from "./crawlers/foodstuffs/request.ts";

export { DEFAULT_FOODSTUFFS_REQUEST_DELAY_MS };

/** 仅解析公共参数；业务入口显式决定默认数量，不再接受切换执行流程的布尔参数。 */
export function parseCli(argv: string[], { defaultLimit = 1 } = {}) {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      limit: { type: "string" },
      rate: { type: "string" },
      "foodstuffs-request-delay": { type: "string" },
    },
  });

  const delay = Number(values["foodstuffs-request-delay"]);
  const positionalLimit = Number(positionals[0]);
  if (Number.isFinite(positionalLimit) && positionalLimit > 0) {
    defaultLimit = positionalLimit;
  }

  return {
    limit: positive(values.limit, defaultLimit),
    rate: positive(values.rate, 1),
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
