/**
 * Home action queue contract (`GET /api/v1/home/queue`).
 *
 * The queue lists what needs the signed-in user's action, one source per kind
 * of item. Titles and context lines are built on the client from these
 * structured fields, so the server sends no English sentences.
 */

export type HomeQueueSourceId =
  | "approvals"
  | "tasks"
  | "intake"
  | "aiApprovals"
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
  | "aiApprovalsWaiting"
  | "promptsBlockedMasked24h";

export interface HomeQueueResponse {
  items: HomeQueueItem[];
  /** A source the user may not see is absent, never zeroed. */
  sources: Partial<Record<HomeQueueSourceId, HomeQueueSourceResult>>;
  /** null = the count failed to load; absent = the user may not see it. */
  counts: Partial<Record<HomeQueueCountId, number | null>>;
}

export interface HomeQueueContext {
  organizationId: number;
  userId: number;
  /** Same permission resolution as the authorize() middleware. */
  can: (permissionKey: string) => boolean;
  /** Server's UTC date, `YYYY-MM-DD`. */
  today: string;
}

export interface HomeQueueSource {
  id: HomeQueueSourceId;
  part: HomeQueuePart;
  isVisible(ctx: HomeQueueContext): boolean;
  load(ctx: HomeQueueContext): Promise<HomeQueueItem[]>;
}
