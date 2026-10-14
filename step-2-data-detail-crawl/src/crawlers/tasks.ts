import type { PlaywrightCrawlingContext } from "crawlee";
export type TaskRouter = {
  addHandler: (
    label: string,
    handler: (ctx: PlaywrightCrawlingContext) => Promise<void>,
  ) => unknown;
};
export const INCREMENTAL_TASK = "incremental";
export const RETRY_ALL_TASK = "retry-all";
export const RETRY_INVALID_DETAIL_TASK = "retry-invalid-detail";
export function createTask(afterId: number, remaining: number, limit: number) {
  return {
    url: "https://www.woolworths.co.nz/",
    label: INCREMENTAL_TASK,
    skipNavigation: true as const,
    uniqueKey: `task:${afterId}:${remaining}`,
    userData: { afterId, remaining, limit },
  };
}

export function createRetryTask(
  retryIds: number[],
  remaining: number,
  limit: number,
) {
  const index = limit - remaining;
  return {
    url: "https://www.woolworths.co.nz/",
    label: RETRY_ALL_TASK,
    skipNavigation: true as const,
    uniqueKey: `retry:${retryIds[index]}:${remaining}`,
    userData: { retryIds, remaining, limit },
  };
}

export function createInvalidDetailRetryTask(
  retryIds: number[],
  remaining: number,
  limit: number,
) {
  const index = limit - remaining;
  return {
    url: "https://www.woolworths.co.nz/",
    label: RETRY_INVALID_DETAIL_TASK,
    skipNavigation: true as const,
    uniqueKey: `retry-invalid-detail:${retryIds[index]}:${remaining}`,
    userData: { retryIds, remaining, limit },
  };
}
