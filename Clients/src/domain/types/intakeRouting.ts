// Intake review routing, as the server stores it.

/** Per-form review routing settings, as the server stores them. */
export interface FormRouting {
  enabled: boolean;
  seniorReviewerIds: number[];
  standardReviewerIds: number[];
  threshold: number;
  closeCallMargin: number;
  secondReviewRate: number;
}

export type ReviewLane = "senior" | "standard";

export type RoutingReason =
  | "prohibited"
  | "no_score"
  | "close_call"
  | "at_or_above_threshold"
  | "below_threshold"
  | "override_raised"
  | "escalated";

export interface SecondReview {
  status: "open" | "agreed" | "missed";
  selectedAt: string;
  reviewedBy?: number;
  reviewedAt?: string;
  note?: string;
  resolvedBy?: number;
  resolvedAt?: string;
  resolutionNote?: string;
}

/** Lane decision for one submission. */
export interface SubmissionRouting {
  lane: ReviewLane;
  reason: RoutingReason;
  score: number | null;
  threshold: number;
  closeCallMargin: number;
  routedAt: string;
  escalation?: { by: number; at: string; reason: string };
  secondReview?: SecondReview;
}
