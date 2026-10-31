import type { SubmissionRouting } from "../../../domain/types/intakeRouting";

/** A second review is waiting: open, or missed and not yet resolved. */
export function hasPendingSecondReview(row: { routing?: SubmissionRouting | null }): boolean {
  const second = row.routing?.secondReview;
  return (
    !!second && (second.status === "open" || (second.status === "missed" && !second.resolvedAt))
  );
}
