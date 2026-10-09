export const RETRY_ALL_VERSION = 1;
export const RETRY_INVALID_DETAIL_VERSION = 1;

export const RETRY_ALL_MARKER = {
  field: "retryAllVersion",
  version: RETRY_ALL_VERSION,
} as const;

export const RETRY_INVALID_DETAIL_MARKER = {
  field: "retryInvalidDetailVersion",
  version: RETRY_INVALID_DETAIL_VERSION,
} as const;

export type RetryMarker =
  | typeof RETRY_ALL_MARKER
  | typeof RETRY_INVALID_DETAIL_MARKER;
