// "Preview as" role simulation for the intake review flow. UI only: it changes
// which controls show, never what the server allows. Every real action is still
// authorised by the server for the signed-in user, and simulation turns
// mutating actions off.

import type {
  FormRouting,
  ReviewLane,
  SubmissionRouting,
} from "../../../domain/types/intakeRouting";
import type { ScoreBand } from "../intakeScoring/scoreMath";
import { hasPendingSecondReview } from "./secondReview";
import {
  canDecideLane,
  entityLevel,
  laneOnRecord,
  laneReviewerIdsFor,
  type ReviewerLists,
} from "./routingRules";

export type PreviewRole = "admin" | "senior" | "standard";

export const PREVIEW_ROLES: readonly PreviewRole[] = ["admin", "senior", "standard"];

export const PREVIEW_ROLE_LABELS: Record<PreviewRole, string> = {
  admin: "Admin",
  senior: "Expert reviewer",
  standard: "Regular reviewer",
};

/** Query param on the Submissions page that turns simulation on. */
export const SIMULATE_ROLE_PARAM = "simulateRole";

/** Query params that open the public form as a builder preview. */
export const PUBLIC_PREVIEW_PARAM = "vwPreview";
export const PUBLIC_PREVIEW_QUERY = `${PUBLIC_PREVIEW_PARAM}=1&as=submitter`;

/** A stand-in user id that matches no real user, so no real assignment applies. */
export const SIMULATED_USER_ID = -1;

/** The server's wording when a user may not decide a senior-lane submission. */
export const DECIDE_BLOCKED_SENIOR = "This submission is assigned to expert reviewers";

export function parsePreviewRole(raw: string | null | undefined): PreviewRole | null {
  return PREVIEW_ROLES.find((role) => role === raw) ?? null;
}

/** Submissions page link that opens the review flow simulated as a role. */
export function reviewPreviewPath(role: PreviewRole): string {
  return `/intake-forms/submissions?${SIMULATE_ROLE_PARAM}=${role}`;
}

/** Reviewer lists with the simulated viewer as the only reviewer of their kind. */
function simulatedLists(role: PreviewRole, routingEnabled: boolean): ReviewerLists {
  return {
    enabled: routingEnabled,
    seniorReviewerIds: role === "senior" ? [SIMULATED_USER_ID] : [],
    standardReviewerIds: role === "standard" ? [SIMULATED_USER_ID] : [],
  };
}

/**
 * Whether the role can act on a second review: one is waiting, and the role is
 * one the server lets act (a senior reviewer or an Admin). The simulated viewer
 * never made the approval. The review modal and the list filter both use this.
 */
export function simulatedCanSecondReview(
  role: PreviewRole,
  row: { routing?: SubmissionRouting | null },
): boolean {
  return hasPendingSecondReview(row) && (role === "admin" || role === "senior");
}

export interface SimulatedGateInput {
  isPending: boolean;
  routingEnabled: boolean;
  /** The form's current routing settings, as loaded for the simulation; null when it has none. */
  formRouting: FormRouting | null;
  stored: SubmissionRouting | null;
  entityType: string;
  /** The level of the submission's EU AI Act run, when it has one. */
  runLevel: string | null;
  entityData: Record<string, unknown>;
  finalScore: number | null;
  scoringStatus: string | null;
  bandInForce: ScoreBand | null;
}

export interface SimulatedGate {
  lane: ReviewLane | null;
  canDecide: boolean;
  canEscalate: boolean;
  canSecondReview: boolean;
  /** The form's real reviewers who can decide the lane, as the server lists them. */
  laneReviewerIds: number[];
  decideBlockedReason: string | null;
}

/** What the review modal would show a viewer in this role, as the server decides it. */
export function simulatedReviewGate(role: PreviewRole, input: SimulatedGateInput): SimulatedGate {
  const cfg: FormRouting | null = input.formRouting
    ? { ...input.formRouting, ...simulatedLists(role, input.routingEnabled) }
    : null;
  const isAdmin = role === "admin";
  const { lane } = laneOnRecord(input.stored, cfg, {
    level: entityLevel(input.entityType, input.runLevel, input.entityData),
    finalScore: input.finalScore,
    scoringStatus: input.scoringStatus,
    bandInForce: input.bandInForce,
  });
  const canDecide = canDecideLane(lane, SIMULATED_USER_ID, isAdmin, cfg);
  const inLane = laneReviewerIdsFor(lane, cfg).includes(SIMULATED_USER_ID);
  return {
    lane,
    canDecide,
    canEscalate:
      input.isPending &&
      input.routingEnabled &&
      input.stored?.lane === "standard" &&
      (isAdmin || inLane),
    canSecondReview: simulatedCanSecondReview(role, { routing: input.stored }),
    laneReviewerIds: input.formRouting
      ? laneReviewerIdsFor(lane, { ...input.formRouting, enabled: input.routingEnabled })
      : [],
    // A simulated role is always on its own reviewer list, so only the senior
    // lane can block it.
    decideBlockedReason: canDecide ? null : DECIDE_BLOCKED_SENIOR,
  };
}

interface LaneRow {
  routingEnabled?: boolean;
  routing?: SubmissionRouting | null;
  laneReviewerIds?: number[];
  secondReviewerIds?: number[];
}

/** A Submissions list row with its assignments as they apply to the simulated viewer. */
export function simulatedLaneRow<T extends LaneRow>(row: T, role: PreviewRole): T {
  return {
    ...row,
    laneReviewerIds: laneReviewerIdsFor(
      row.routing?.lane ?? null,
      simulatedLists(role, !!row.routingEnabled),
    ),
    secondReviewerIds: simulatedCanSecondReview(role, row) ? [SIMULATED_USER_ID] : [],
  };
}
