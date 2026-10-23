import { parseArgs } from "node:util";

/** 严格解析参数，避免旧预览参数被忽略后意外写库。 */
export function readLimit(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: { limit: { type: "string" } },
    strict: true,
  });
  if (values.limit === undefined) return Infinity;
  const limit = Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("--limit must be a positive integer");
  return limit;
}
