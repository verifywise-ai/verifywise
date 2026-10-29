import { describe, it, expect } from "vitest";
import {
  parsePreviewRole,
  simulatedLaneRow,
  simulatedReviewGate,
  SIMULATED_USER_ID,
  type SimulatedGateInput,
} from "../previewRole";
import type { SubmissionRouting } from "../../../../presentation/pages/IntakeFormBuilder/types";
import { matchesLaneFilter } from "../../../../presentation/pages/IntakeFormBuilder/routing/laneFilter";

const routed = (lane: "senior" | "standard"): SubmissionRouting => ({
  lane,
  reason: lane === "senior" ? "at_or_above_threshold" : "below_threshold",
  score: lane === "senior" ? 80 : 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-01T00:00:00Z",
});

const input = (stored: SubmissionRouting | null, routingEnabled = true): SimulatedGateInput => ({
  isPending: true,
  routingEnabled,
  formRouting: null,
  stored,
  effective: { level: null, finalScore: 20, scoringStatus: "complete", bandInForce: null },
});

describe("parsePreviewRole", () => {
  it("accepts only the three roles", () => {
    expect(parsePreviewRole("admin")).toBe("admin");
    expect(parsePreviewRole("senior")).toBe("senior");
    expect(parsePreviewRole("standard")).toBe("standard");
    expect(parsePreviewRole("Admin")).toBeNull();
    expect(parsePreviewRole("superadmin")).toBeNull();
    expect(parsePreviewRole(null)).toBeNull();
  });
});

describe("simulatedReviewGate", () => {
  it("blocks a standard reviewer on a senior-lane submission", () => {
    expect(simulatedReviewGate("standard", input(routed("senior"))).canDecide).toBe(false);
  });

  it("lets a standard reviewer decide and escalate in the standard lane", () => {
    const gate = simulatedReviewGate("standard", input(routed("standard")));
    expect(gate).toEqual({ canDecide: true, canEscalate: true, canSecondReview: false });
  });

  it("lets a senior reviewer decide either lane and second-review", () => {
    expect(simulatedReviewGate("senior", input(routed("senior")))).toEqual({
      canDecide: true,
      canEscalate: false,
      canSecondReview: true,
    });
  });

  it("lets an Admin decide any lane", () => {
    expect(simulatedReviewGate("admin", input(routed("senior"))).canDecide).toBe(true);
  });

  it("routes an unrouted pending score to senior, as the server does", () => {
    const unrouted = {
      ...input(null),
      effective: { ...input(null).effective, scoringStatus: "pending" },
    };
    expect(simulatedReviewGate("standard", unrouted).canDecide).toBe(false);
  });

  it("lets anyone decide when routing is off", () => {
    expect(simulatedReviewGate("standard", input(routed("senior"), false)).canDecide).toBe(true);
  });
});

describe("simulatedLaneRow", () => {
  it("assigns rows to the simulated viewer for the Assigned to me filter", () => {
    const senior = { routingEnabled: true, routing: routed("senior"), laneReviewerIds: [1] };
    const standard = { routingEnabled: true, routing: routed("standard"), laneReviewerIds: [2] };
    const mine = (row: typeof senior, role: "admin" | "senior" | "standard") =>
      matchesLaneFilter(simulatedLaneRow(row, role), "mine", SIMULATED_USER_ID);
    expect(mine(senior, "standard")).toBe(false);
    expect(mine(standard, "standard")).toBe(true);
    expect(mine(senior, "senior")).toBe(true);
    expect(mine(standard, "senior")).toBe(true);
    expect(mine(senior, "admin")).toBe(false);
  });
});
