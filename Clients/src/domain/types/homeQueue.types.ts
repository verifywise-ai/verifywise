/**
 * Home action queue contract (`GET /api/v1/home/queue`), mirrored from
 * `Servers/domain.layer/interfaces/i.homeQueue.ts`. Keep the two in step.
 *
 * The server sends structured fields only; titles and context lines are built
 * on the client (`queueItemText`) so every language reads correctly.
 */

export type HomeQueueSourceId =
  | "approvals"
  | "tasks"
  | "intake"
  | "risks"
  | "policyReviews"
  | "vendorReviews"
  | "incidents"
  | "mrmFindings";

/** Sidebar group the item belongs to; "automate" is the top group (neutral dot). */
export type HomeQueuePart = "automate" | "record" | "track" | "enforce";

export interface HomeQueueItem {
  /** `${source}:${entityId}`, plus a suffix when one entity can appear twice. */
  id: string;
  source: HomeQueueSourceId;
  part: HomeQueuePart;
  entityType: string;
  entityId: number;
  name: string;
  /** Client route that opens the record or the page where it is decided. */
  url: string;
  /** `YYYY-MM-DD`, or null when the item has no due date. */
  dueDate: string | null;
  /** ISO timestamp the item has been waiting since, or null. */
  waitingSince: string | null;
  overdue: boolean;
  /**
   * Per source: approvals `stepNumber`, `stepCount`; tasks `status`, `priority`;
   * intake `kind` ("review" | "second-review"), `formName`, `lane`; risks
   * `mitigationStatus`, `riskLevel`; policyReviews `status`; vendorReviews
   * `reviewStatus`; incidents `status`, `severity`; mrmFindings `stage`, `severity`.
   */
  meta: Record<string, string | number | null>;
}

export interface HomeQueueSourceResult {
  status: "ok" | "unavailable";
  count: number;
}

export type HomeQueueCountId =
  | "intakeWaiting"
  | "agentsToReview"
  | "aiOnRecord"
  | "untreatedRisks"
  | "vendorReviewsDue"
  | "policyReviewsDue"
  | "promptsBlockedMasked24h";

export interface HomeQueueResponse {
  items: HomeQueueItem[];
  /** A source the user may not see is absent, never zeroed. */
  sources: Partial<Record<HomeQueueSourceId, HomeQueueSourceResult>>;
  /** null = the count failed to load; absent = the user may not see it. */
  counts: Partial<Record<HomeQueueCountId, number | null>>;
}
