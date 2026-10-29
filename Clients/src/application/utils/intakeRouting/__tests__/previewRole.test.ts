import { describe, it, expect } from "vitest";
import {
  DECIDE_BLOCKED_SENIOR,
  PREVIEW_ROLES,
  parsePreviewRole,
  simulatedCanSecondReview,
  simulatedLaneRow,
  simulatedReviewGate,
  SIMULATED_USER_ID,
  type SimulatedGateInput,
} from "../previewRole";
import type {
  FormRouting,
  SecondReview,
  SubmissionRouting,
} from "../../../../domain/types/intakeRouting";
import { matchesLaneFilter } from "../../../../presentation/pages/IntakeFormBuilder/routing/laneFilter";

const SENIOR_IDS = [1, 3];
const STANDARD_IDS = [2];
const FORM_ROUTING: FormRouting = {
  enabled: true,
  seniorReviewerIds: SENIOR_IDS,
  standardReviewerIds: STANDARD_IDS,
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};

const routed = (lane: "senior" | "standard", secondReview?: SecondReview): SubmissionRouting => ({
  lane,
  reason: lane === "senior" ? "at_or_above_threshold" : "below_threshold",
  score: lane === "senior" ? 80 : 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-01T00:00:00Z",
  ...(secondReview ? { secondReview } : {}),
});

const input = (
  stored: SubmissionRouting | null,
  overrides: Partial<SimulatedGateInput> = {},
): SimulatedGateInput => ({
  isPending: true,
  routingEnabled: true,
  formRouting: FORM_ROUTING,
  stored,
  entityType: "use_case",
  runLevel: null,
  entityData: {},
  finalScore: 20,
  scoringStatus: "complete",
  bandInForce: null,
  ...overrides,
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
  it("blocks a standard reviewer on a senior-lane submission and names its reviewers", () => {
    const gate = simulatedReviewGate("standard", input(routed("senior")));
    expect(gate.canDecide).toBe(false);
    expect(gate.laneReviewerIds).toEqual(SENIOR_IDS);
    expect(gate.decideBlockedReason).toBe(DECIDE_BLOCKED_SENIOR);
  });

  it("lists the standard lane reviewers, seniors included, for the standard lane", () => {
    const gate = simulatedReviewGate("admin", input(routed("standard")));
    expect(gate.laneReviewerIds).toEqual([2, 1, 3]);
    expect(gate.decideBlockedReason).toBeNull();
  });

  it("lets a standard reviewer decide and escalate in the standard lane", () => {
    const gate = simulatedReviewGate("standard", input(routed("standard")));
    expect(gate).toMatchObject({ canDecide: true, canEscalate: true, canSecondReview: false });
  });

  it("lets a senior reviewer decide either lane", () => {
    expect(simulatedReviewGate("senior", input(routed("senior"))).canDecide).toBe(true);
    expect(simulatedReviewGate("senior", input(routed("standard"))).canDecide).toBe(true);
  });

  it("lets an Admin decide any lane", () => {
    expect(simulatedReviewGate("admin", input(routed("senior"))).canDecide).toBe(true);
  });

  it("routes an unrouted pending score to senior, as the server does", () => {
    const gate = simulatedReviewGate("standard", input(null, { scoringStatus: "pending" }));
    expect(gate.lane).toBe("senior");
    expect(gate.canDecide).toBe(false);
  });

  it("routes an unrouted use case mapped to Prohibited to senior, as the server does", () => {
    const mapped = { entityData: { ai_risk_classification: "unacceptable" } };
    const gate = simulatedReviewGate("standard", input(null, mapped));
    expect(gate.lane).toBe("senior");
    expect(gate.canDecide).toBe(false);
    expect(gate.decideBlockedReason).toBe(DECIDE_BLOCKED_SENIOR);
    // The EU AI Act run's level wins over the mapped answer.
    const withRun = simulatedReviewGate(
      "standard",
      input(null, { ...mapped, runLevel: "High risk" }),
    );
    expect(withRun.lane).toBe("standard");
    expect(withRun.canDecide).toBe(true);
  });

  it("lets anyone decide when routing is off or the form has none", () => {
    expect(
      simulatedReviewGate("standard", input(routed("senior"), { routingEnabled: false })).canDecide,
    ).toBe(true);
    const none = simulatedReviewGate("standard", input(routed("senior"), { formRouting: null }));
    expect(none).toMatchObject({ canDecide: true, laneReviewerIds: [], decideBlockedReason: null });
  });
});

describe("second review: the modal and the list agree", () => {
  const states: Array<[string, SecondReview | undefined]> = [
    ["none", undefined],
    ["open", { status: "open", selectedAt: "2026-10-02T00:00:00Z" }],
    ["agreed", { status: "agreed", selectedAt: "2026-10-02T00:00:00Z" }],
    ["missed", { status: "missed", selectedAt: "2026-10-02T00:00:00Z" }],
    [
      "missed, resolved",
      { status: "missed", selectedAt: "2026-10-02T00:00:00Z", resolvedAt: "2026-10-03" },
    ],
  ];

  for (const role of PREVIEW_ROLES) {
    it.each(states)(`${role}: %s`, (_, secondReview) => {
      const routing = routed("standard", secondReview);
      const inModal = simulatedReviewGate(
        role,
        input(routing, { isPending: false, routingEnabled: false }),
      ).canSecondReview;
      // Routing off, so "Assigned to me" can only match through the second review.
      const row = { routingEnabled: false, routing, reviewedBy: 2 };
      const inList = matchesLaneFilter(simulatedLaneRow(row, role), "mine", SIMULATED_USER_ID);
      expect(inModal).toBe(inList);
      expect(inModal).toBe(simulatedCanSecondReview(role, { routing }));
      const pending = secondReview?.status === "open" || secondReview?.status === "missed";
      const waiting = pending && !secondReview?.resolvedAt;
      expect(inModal).toBe(waiting && role !== "standard");
    });
  }
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
