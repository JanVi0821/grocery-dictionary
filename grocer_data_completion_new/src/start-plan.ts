export type DupReport = { count: number; examples: number[] };

export function planStart(opts: {
  retryNeedsReview: boolean;
  latestProductId: number;
  retryIds: number[];
  duplicates: DupReport;
}) {
  if (opts.retryNeedsReview) {
    if (opts.duplicates.count > 0) {
      return { abort: true as const, duplicates: opts.duplicates };
    }
    return {
      abort: false as const,
      mode: "retry" as const,
      retryIds: opts.retryIds,
    };
  }
  return {
    abort: false as const,
    mode: "incremental" as const,
    afterId: opts.latestProductId,
  };
}

export function duplicateAbortMessage(duplicates: DupReport) {
  return `[abort] duplicate productId groups=${duplicates.count} examples=${duplicates.examples.join(",")} — do not auto-delete; backup then collapse, then --ensure-unique-productId`;
}
