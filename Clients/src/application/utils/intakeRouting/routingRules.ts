// Clients/src/application/utils/intakeRouting/routingRules.ts
// Client copy of the deterministic lane functions in
// Servers/services/intakeRouting/routingRules.ts (laneFor, canDecideLane,
// laneReviewerIdsFor) and Servers/services/intakeRouting/decisionGate.ts
// (laneAtDecision, laneOnRecord). Keep identical: both test suites run
// Servers/services/intakeRouting/__fixtures__/routingRulesCases.json.
// Used only to simulate a reviewer role in preview; the server decides who acts.

import type { ScoreBand } from "../intakeScoring/scoreMath";
import type {
  FormRouting,
  ReviewLane,
  RoutingReason,
  SubmissionRouting,
} from "../../../presentation/pages/IntakeFormBuilder/types";

export const DEFAULT_ROUTING: Omit<
  FormRouting,
  "enabled" | "seniorReviewerIds" | "standardReviewerIds"
> = { threshold: 50, closeCallMargin: 10, secondReviewRate: 10 };

/** Lowest score of each band, used to re-route after a band override. */
export const BAND_LOWER_BOUND: Record<ScoreBand, number> = {
  Low: 0,
  Medium: 26,
  High: 51,
  Critical: 76,
};

/** First matching rule wins. */
export function laneFor(
  input: { level: string | null; finalScore: number | null; scoringStatus: string | null },
  cfg: Pick<FormRouting, "threshold" | "closeCallMargin">,
): { lane: ReviewLane; reason: RoutingReason } {
  if (input.level === "Prohibited") return { lane: "senior", reason: "prohibited" };
  if (input.finalScore === null || input.scoringStatus === "ai_failed") {
    return { lane: "senior", reason: "no_score" };
  }
  if (Math.abs(input.finalScore - cfg.threshold) < cfg.closeCallMargin) {
    return { lane: "senior", reason: "close_call" };
  }
  if (input.finalScore >= cfg.threshold) {
    return { lane: "senior", reason: "at_or_above_threshold" };
  }
  return { lane: "standard", reason: "below_threshold" };
}

export function canDecideLane(
  lane: ReviewLane | null,
  userId: number,
  isAdmin: boolean,
  cfg: FormRouting | null,
): boolean {
  if (!cfg?.enabled || lane === null || isAdmin) return true;
  if (cfg.seniorReviewerIds.includes(userId)) return true;
  return lane === "standard" && cfg.standardReviewerIds.includes(userId);
}

/** Ids of the users who can decide a submission in a lane: senior reviewers sit in both. */
export function laneReviewerIdsFor(lane: ReviewLane | null, cfg: FormRouting | null): number[] {
  if (!cfg?.enabled || lane === null) return [];
  if (lane === "senior") return cfg.seniorReviewerIds;
  return [...new Set([...cfg.standardReviewerIds, ...cfg.seniorReviewerIds])];
}

type EffectiveValues = {
  level: string | null;
  finalScore: number | null;
  scoringStatus: string | null;
  bandInForce: ScoreBand | null;
};

/**
 * The lane a decision is made in: the stored lane, raised to senior when the
 * values the decision would make true route there. Never lowers a stored lane.
 * Null only when routing is off.
 */
export function laneAtDecision(
  stored: Pick<SubmissionRouting, "lane" | "reason"> | null,
  cfg: FormRouting | null,
  effective: EffectiveValues,
): { lane: ReviewLane | null; reason: RoutingReason | null } {
  if (!cfg?.enabled) return { lane: null, reason: null };
  if (stored?.lane === "senior") return { lane: "senior", reason: stored.reason };

  const bandFloor = effective.bandInForce ? BAND_LOWER_BOUND[effective.bandInForce] : null;
  const finalScore =
    effective.finalScore !== null && bandFloor !== null
      ? Math.max(effective.finalScore, bandFloor)
      : effective.finalScore;
  const scoringStatus =
    effective.scoringStatus === "pending" ? "ai_failed" : effective.scoringStatus;
  const result = laneFor({ level: effective.level, finalScore, scoringStatus }, cfg);
  if (result.lane === "senior" || !stored) return result;
  return { lane: "standard", reason: stored.reason };
}

/**
 * The lane that decides who may act (reject, and the preview's buttons): the
 * stored lane when there is one, else the lane the current values route to.
 * Null only when routing is off.
 */
export function laneOnRecord(
  stored: Pick<SubmissionRouting, "lane" | "reason"> | null,
  cfg: FormRouting | null,
  effective: EffectiveValues,
): { lane: ReviewLane | null; reason: RoutingReason | null } {
  if (!cfg?.enabled) return { lane: null, reason: null };
  if (stored) return { lane: stored.lane, reason: stored.reason };
  return laneAtDecision(null, cfg, effective);
}
