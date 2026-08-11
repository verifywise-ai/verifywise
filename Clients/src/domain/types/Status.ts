export const STATUSES = [
  "Not started",
  "Draft",
  "In progress",
  "Awaiting review",
  "Awaiting approval",
  "Implemented",
  "Audited",
  "Needs rework",
] as const;

export type Status = (typeof STATUSES)[number];

/**
 * Statuses that count an item as completed/done for progress and "implemented"
 * counts. "Audited" is a completed state one step past "Implemented", so it must
 * count as done — otherwise auditing an item regresses its completion. Keep this
 * in sync with the backend switch in Servers/utils/frameworkImpl.utils.ts.
 */
const COMPLETED_STATUSES = new Set<string>(["Implemented", "Audited"]);

export const isCompletedStatus = (status?: string | null): boolean =>
  status != null && COMPLETED_STATUSES.has(status);
