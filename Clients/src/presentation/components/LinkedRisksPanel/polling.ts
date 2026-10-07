import { RiskLink } from "../../../domain/interfaces/i.riskLink";

/**
 * The scan and the hierarchy pass are queued, not done, when their request
 * returns. Poll the list for this long afterwards so the worker's result
 * actually reaches the screen, then stop and say what happened — an open-ended
 * poll and a notice that never settles are the same lie in different shapes.
 */
export const POLL_INTERVAL_MS = 2000;
/** Scoring is SQL and answers in a second. */
export const SCAN_WINDOW_MS = 30000;
/** Grouping is a model call. A reasoning model spends minutes on one cluster. */
export const GROUPING_WINDOW_MS = 180000;

/** What "the worker changed something" looks like. Status and relation move
 *  without the count moving, which is exactly what a hierarchy pass does. */
export const fingerprint = (links: RiskLink[]) =>
  links.map((l) => `${l.id}:${l.relationType}:${l.status}`).join("|");

export interface PendingJob {
  /** The list as it stood when the job was queued. */
  before: string;
  /** Which view that fingerprint was taken from. */
  dismissedView: boolean;
  /** Shown when the window closes with the list unchanged. */
  timedOut: string;
  /** How long to watch. A scan and a model call are not the same wait. */
  window: number;
}
