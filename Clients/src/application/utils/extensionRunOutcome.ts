/**
 * How sync panels read a run's outcome: from the sync engine's `status` and
 * machine `code`, never from message text.
 */
export const SYNC_RUN_CODES = { abandoned: "abandoned", skipped: "skipped" } as const;

export const SYNC_RUNNING_MESSAGE = "A sync is already running. Try again when it finishes.";

type RunLike = { status?: string | null; code?: string | null } | null | undefined;

/** A run the server closed because it stopped heart-beating. */
export function isAbandonedRun(run: RunLike): boolean {
  return run?.status === "abandoned" || run?.code === SYNC_RUN_CODES.abandoned;
}

/** A manual run that did not start because another run held the claim. */
export function isSkippedRun(run: RunLike): boolean {
  return run?.status === "skipped" || run?.code === SYNC_RUN_CODES.skipped;
}
