/**
 * How the Jira Assets panel reads run outcomes. Sync runs come from the sync
 * engine (`status`, and `code` "abandoned" or "skipped"); the readers are
 * shared with every sync panel. 409s from import and removal carry Jira's own
 * codes and are classified in batching.ts (classifyStop).
 */
export {
  isAbandonedRun,
  isSkippedRun,
  SYNC_RUNNING_MESSAGE,
} from "../../../../application/utils/extensionRunOutcome";

export const RUN_CODES = {
  abandoned: "abandoned",
  skipped: "skipped",
  importInterrupted: "import_interrupted",
  removalInterrupted: "removal_interrupted",
} as const;

/** Shown if a removal lost its claim and the 409 body carries no message. */
export const REMOVAL_INTERRUPTED_MESSAGE =
  "The removal was interrupted; nothing was removed. Try again.";
