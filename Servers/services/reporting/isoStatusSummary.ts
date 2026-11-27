import { isTerminalStatus } from "./analyzers/prompts";

/**
 * Status of an ISO clause or annex in the report, worked out from the rows
 * under it. The struct tables behind clauses and annexes have no status of
 * their own; the statuses sit on subclauses, annex categories and annex
 * controls. Rows marked not applicable are left out.
 *
 * - "Implemented (n/n)": every row is Implemented or Audited
 * - "Not started (0/n)": no row has moved past Not started
 * - "In progress (d/n)": anything in between
 * - "-": no applicable rows for this project
 */
export const summarizeIsoStatus = (
  rows: Array<{ status?: string | null; isApplicable?: boolean }>,
): string => {
  const applicable = rows.filter((row) => row.isApplicable !== false);
  const total = applicable.length;
  if (total === 0) return "-";

  const done = applicable.filter((row) => isTerminalStatus(row.status)).length;
  if (done === total) return `Implemented (${done}/${total})`;

  const notStarted = applicable.every(
    (row) => !row.status || row.status.trim().toLowerCase() === "not started",
  );
  if (notStarted) return `Not started (0/${total})`;

  return `In progress (${done}/${total})`;
};
