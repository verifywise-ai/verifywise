// "Preview as" role simulation for the intake review flow. UI only: it changes
// which controls show, never what the server allows. Every real action is still
// authorised by the server for the signed-in user, and simulation turns
// mutating actions off.

import type {
  FormRouting,
  SubmissionRouting,
} from "../../../presentation/pages/IntakeFormBuilder/types";
import { hasPendingSecondReview } from "../../../presentation/pages/IntakeFormBuilder/routing/laneFilter";
import type { ScoreBand } from "../intakeScoring/scoreMath";
import { canDecideLane, DEFAULT_ROUTING, laneOnRecord, laneReviewerIdsFor } from "./routingRules";

export type PreviewRole = "admin" | "senior" | "standard";

export const PREVIEW_ROLES: readonly PreviewRole[] = ["admin", "senior", "standard"];

export const PREVIEW_ROLE_LABELS: Record<PreviewRole, string> = {
  admin: "Admin",
  senior: "Senior reviewer",
  standard: "Standard reviewer",
};

/** Query param on the Submissions page that turns simulation on. */
export const SIMULATE_ROLE_PARAM = "simulateRole";

/** Query params that open the public form as a builder preview. */
export const PUBLIC_PREVIEW_PARAM = "vwPreview";
export const PUBLIC_PREVIEW_QUERY = `${PUBLIC_PREVIEW_PARAM}=1&as=submitter`;

/** A stand-in user id that matches no real user, so no real assignment applies. */
export const SIMULATED_USER_ID = -1;

export function parsePreviewRole(raw: string | null | undefined): PreviewRole | null {
  return PREVIEW_ROLES.find((role) => role === raw) ?? null;
}

/** Submissions page link that opens the review flow simulated as a role. */
export function reviewPreviewPath(role: PreviewRole): string {
  return `/intake-forms/submissions?${SIMULATE_ROLE_PARAM}=${role}`;
}

/**
 * The form's routing as it applies to a simulated viewer: the same lane
 * settings, with the viewer as the only reviewer of their kind.
 */
export function simulatedRouting(
  role: PreviewRole,
  routingEnabled: boolean,
  formRouting: FormRouting | null | undefined,
): FormRouting {
  const base = formRouting ?? {
    ...DEFAULT_ROUTING,
    seniorReviewerIds: [],
    standardReviewerIds: [],
  };
  return {
    ...base,
    enabled: routingEnabled,
    seniorReviewerIds: role === "senior" ? [SIMULATED_USER_ID] : [],
    standardReviewerIds: role === "standard" ? [SIMULATED_USER_ID] : [],
  };
}

export interface SimulatedGateInput {
  isPending: boolean;
  routingEnabled: boolean;
  formRouting: FormRouting | null | undefined;
  stored: SubmissionRouting | null;
  effective: {
    level: string | null;
    finalScore: number | null;
    scoringStatus: string | null;
    bandInForce: ScoreBand | null;
  };
}

export interface SimulatedGate {
  canDecide: boolean;
  canEscalate: boolean;
  canSecondReview: boolean;
}

/** What the review modal would show a viewer in this role, as the server decides it. */
export function simulatedReviewGate(role: PreviewRole, input: SimulatedGateInput): SimulatedGate {
  const cfg = simulatedRouting(role, input.routingEnabled, input.formRouting);
  const isAdmin = role === "admin";
  const { lane } = laneOnRecord(input.stored, cfg, input.effective);
  const inLane = laneReviewerIdsFor(lane, cfg).includes(SIMULATED_USER_ID);
  return {
    canDecide: canDecideLane(lane, SIMULATED_USER_ID, isAdmin, cfg),
    canEscalate:
      input.isPending &&
      input.routingEnabled &&
      input.stored?.lane === "standard" &&
      (isAdmin || inLane),
    // The simulated viewer never made the approval.
    canSecondReview: isAdmin || role === "senior",
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
  const cfg = simulatedRouting(role, !!row.routingEnabled, null);
  return {
    ...row,
    laneReviewerIds: laneReviewerIdsFor(row.routing?.lane ?? null, cfg),
    secondReviewerIds: hasPendingSecondReview(row) && role === "senior" ? [SIMULATED_USER_ID] : [],
  };
}
