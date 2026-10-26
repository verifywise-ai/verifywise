import type { SubmissionRouting } from "../types";

export type LaneFilter = "all" | "senior" | "standard" | "unrouted" | "mine" | "second_review";

export const LANE_FILTER_ITEMS: Array<{ _id: LaneFilter; name: string }> = [
  { _id: "all", name: "All" },
  { _id: "senior", name: "Senior" },
  { _id: "standard", name: "Standard" },
  { _id: "unrouted", name: "Not routed" },
  { _id: "mine", name: "Assigned to me" },
  { _id: "second_review", name: "Second review" },
];

interface LaneRow {
  routingEnabled?: boolean;
  routing?: SubmissionRouting | null;
  laneReviewerIds?: number[];
  /** Senior reviewers who can act on an open or unresolved-missed second review */
  secondReviewerIds?: number[];
  /** The user who approved the submission */
  reviewedBy?: number;
}

/** A second review is waiting: open, or missed and not yet resolved. */
export function hasPendingSecondReview(row: Pick<LaneRow, "routing">): boolean {
  const second = row.routing?.secondReview;
  return (
    !!second && (second.status === "open" || (second.status === "missed" && !second.resolvedAt))
  );
}

/** Whether a list row passes the lane filter; "mine" = the user can decide its assigned lane. */
export function matchesLaneFilter(
  row: LaneRow,
  filter: LaneFilter,
  userId: number | null,
): boolean {
  if (filter === "all") return true;
  // Second reviews sit on approved rows, and seniors can act on them even
  // after the form's routing was turned off.
  if (filter === "second_review") return hasPendingSecondReview(row);
  const secondReviewMine =
    userId !== null &&
    hasPendingSecondReview(row) &&
    !!row.secondReviewerIds?.includes(userId) &&
    row.reviewedBy !== userId;
  if (filter === "mine" && secondReviewMine) return true;
  // Rows of routing-off forms keep a stored lane as a record only.
  if (!row.routingEnabled) return false;
  switch (filter) {
    case "senior":
    case "standard":
      return row.routing?.lane === filter;
    case "unrouted":
      return !row.routing;
    case "mine":
      return userId !== null && !!row.laneReviewerIds?.includes(userId);
  }
}
