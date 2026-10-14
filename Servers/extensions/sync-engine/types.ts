import type { Transaction } from "sequelize";

/** Keys of sync providers; the same rule as extensions.key. */
export const EXTENSION_KEY_PATTERN = /^[a-z0-9-]+$/;
/** A `started` run with no heartbeat (else start) for this long is abandoned. */
export const STALE_AFTER_MINUTES = 15;
/** Run messages are cut to this many characters. */
export const MESSAGE_MAX_LENGTH = 2000;
/** A run's `signal` aborts after this long unless the provider sets runDeadlineMs. */
export const DEFAULT_RUN_DEADLINE_MS = 10 * 60 * 1000;
/** Backoff for failing scheduled runs never exceeds this many hours. */
export const BACKOFF_CAP_HOURS = 24;

/** `message` of a run closed because it stopped heart-beating. */
export const ABANDONED_RUN_MESSAGE = "Sync stopped responding and was marked as abandoned";
/** `message` of a manual run the worker skipped because another run held the claim. */
export const SKIPPED_RUN_MESSAGE =
  "Another sync or import was running, so this sync did not start.";

export const RUN_STATUSES = ["started", "completed", "failed", "abandoned", "skipped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type Readiness = { ready: true } | { ready: false; status: 400 | 404; reason: string };

export interface RunResult {
  /** Provider-defined counters; non-finite values are dropped. */
  counts: Record<string, number>;
  message?: string | null;
  code?: string | null;
}

/**
 * What a provider gets for one claimed run.
 *
 * sqlOwnsRun and assertOwned share-lock the run row until the surrounding
 * transaction ends. Inside such a transaction, heartbeat, finalize and release
 * MUST receive that transaction `t`; called without it they run on another
 * connection and wait on the lock forever (a deadlock Postgres cannot detect).
 */
export interface RunContext {
  orgId: number;
  runId: number;
  kind: string;
  payload: unknown;
  triggeredBy: number | null;
  /** Throws RunSupersededError when the claim is lost. */
  heartbeat(t?: Transaction): Promise<void>;
  /** SQL boolean proving this run still owns its row (share-locks it); for provider writes. */
  sqlOwnsRun(alias?: string): string;
  /** FOR SHARE on the run row inside the caller's transaction; RunSupersededError if lost. */
  assertOwned(t: Transaction): Promise<void>;
  /** Close as completed; inside the caller's transaction when given. */
  finalize(result: RunResult, t?: Transaction): Promise<void>;
  /** Delete a claim that did nothing, so it leaves no history row. */
  release(t?: Transaction): Promise<void>;
  /** Aborted at the run deadline. */
  signal: AbortSignal;
}

export interface SyncProvider {
  /** extensions.key; must match EXTENSION_KEY_PATTERN. */
  key: string;
  /** Name used in event-log text (for example "Jira Assets"); the key when absent. */
  displayName?: string;
  /** Every exclusive operation of the extension; must include "manual". */
  kinds: readonly string[];
  /** The kind the tick enqueues; no schedule if absent. */
  scheduledKind?: string;
  /** Deadline for `ctx.signal`; DEFAULT_RUN_DEADLINE_MS when absent. */
  runDeadlineMs?: number;
  readiness(orgId: number, kind: string): Promise<Readiness>;
  /** Refuses schedule changes (PATCH /:key/schedule) with its status; allowed when absent. */
  canSchedule?(orgId: number): Promise<Readiness>;
  /** Return a result for the engine to finalize, or void after finalizing itself. */
  run(ctx: RunContext): Promise<RunResult | void>;
}
