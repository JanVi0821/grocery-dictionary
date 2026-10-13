import type { FoodstuffsPlatform, FoodstuffsStore } from "./types.ts";

export type StoreMode = "fast" | "expanded";

export function storesForMode(
  platform: FoodstuffsPlatform,
  mode: StoreMode,
): FoodstuffsStore[] {
  if (mode === "expanded") return [...platform.stores];
  return platform.stores.filter((s) =>
    (platform.fastStoreIds as readonly string[]).includes(s.id),
  );
}
