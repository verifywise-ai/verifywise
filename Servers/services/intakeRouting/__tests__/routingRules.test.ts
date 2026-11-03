import {
  DEFAULT_ROUTING,
  BAND_LOWER_BOUND,
  canDecideLane,
  laneFor,
  validateRoutingSettings,
} from "../routingRules";
import type { IFormRouting } from "../../../domain.layer/interfaces/i.intakeForm";

const cfg = { threshold: 50, closeCallMargin: 10 };
const scored = (finalScore: number | null, scoringStatus: string | null = "complete") => ({
  level: "High",
  finalScore,
  scoringStatus,
});

describe("laneFor", () => {
  it("sends Prohibited to senior", () => {
    expect(
      laneFor({ level: "Prohibited", finalScore: 12, scoringStatus: "complete" }, cfg),
    ).toEqual({ lane: "senior", reason: "prohibited" });
  });

  it("sends a missing score to senior", () => {
    expect(laneFor(scored(null), cfg)).toEqual({ lane: "senior", reason: "no_score" });
  });

  it("sends a failed AI score to senior even with a number", () => {
    expect(laneFor(scored(30, "ai_failed"), cfg)).toEqual({
      lane: "senior",
      reason: "no_score",
    });
  });

  it("treats a margin distance of exactly the margin as not close", () => {
    expect(laneFor(scored(40), cfg)).toEqual({ lane: "standard", reason: "below_threshold" });
  });

  it("flags scores inside the margin as close calls on both sides", () => {
    expect(laneFor(scored(41), cfg)).toEqual({ lane: "senior", reason: "close_call" });
    expect(laneFor(scored(59), cfg)).toEqual({ lane: "senior", reason: "close_call" });
  });

  it("sends scores at or above threshold + margin to senior", () => {
    expect(laneFor(scored(60), cfg)).toEqual({
      lane: "senior",
      reason: "at_or_above_threshold",
    });
  });

  it("handles a zero margin", () => {
    const zero = { threshold: 50, closeCallMargin: 0 };
    expect(laneFor(scored(50), zero)).toEqual({
      lane: "senior",
      reason: "at_or_above_threshold",
    });
    expect(laneFor(scored(49), zero)).toEqual({ lane: "standard", reason: "below_threshold" });
  });
});

describe("BAND_LOWER_BOUND", () => {
  it("matches the band floors", () => {
    expect(BAND_LOWER_BOUND).toEqual({ Low: 0, Medium: 26, High: 51, Critical: 76 });
  });
});

describe("validateRoutingSettings", () => {
  const base = { enabled: true, seniorReviewerIds: [1], standardReviewerIds: [2] };

  it("accepts a complete enabled config and applies defaults", () => {
    expect(validateRoutingSettings(base)).toEqual({
      ok: true,
      value: { ...base, ...DEFAULT_ROUTING },
    });
  });

  it("requires both lists when enabled", () => {
    const r = validateRoutingSettings({ ...base, standardReviewerIds: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range or non-integer numbers", () => {
    expect(validateRoutingSettings({ ...base, threshold: 0 }).ok).toBe(false);
    expect(validateRoutingSettings({ ...base, threshold: 100 }).ok).toBe(false);
    expect(validateRoutingSettings({ ...base, threshold: 50.5 }).ok).toBe(false);
    expect(validateRoutingSettings({ ...base, closeCallMargin: 26 }).ok).toBe(false);
    expect(validateRoutingSettings({ ...base, secondReviewRate: 101 }).ok).toBe(false);
  });

  it("accepts the range edges", () => {
    const r = validateRoutingSettings({
      ...base,
      threshold: 99,
      closeCallMargin: 0,
      secondReviewRate: 100,
    });
    expect(r.ok).toBe(true);
  });

  it("allows a disabled config with empty lists", () => {
    expect(validateRoutingSettings({ enabled: false })).toEqual({
      ok: true,
      value: {
        enabled: false,
        seniorReviewerIds: [],
        standardReviewerIds: [],
        ...DEFAULT_ROUTING,
      },
    });
  });

  it("de-duplicates reviewer ids", () => {
    const r = validateRoutingSettings({ ...base, seniorReviewerIds: [1, 1, 2] });
    expect(r.ok && r.value.seniorReviewerIds).toEqual([1, 2]);
  });

  it("rejects non-objects and bad id lists", () => {
    expect(validateRoutingSettings(null).ok).toBe(false);
    expect(validateRoutingSettings({ ...base, seniorReviewerIds: ["a"] }).ok).toBe(false);
  });
});

describe("canDecideLane", () => {
  const routing: IFormRouting = {
    enabled: true,
    seniorReviewerIds: [1],
    standardReviewerIds: [2],
    ...DEFAULT_ROUTING,
  };

  it("restricts the senior lane to senior reviewers and Admins", () => {
    expect(canDecideLane("senior", 1, false, routing)).toBe(true);
    expect(canDecideLane("senior", 2, false, routing)).toBe(false);
    expect(canDecideLane("senior", 9, true, routing)).toBe(true);
    expect(canDecideLane("senior", 9, false, routing)).toBe(false);
  });

  it("lets standard and senior reviewers decide the standard lane", () => {
    expect(canDecideLane("standard", 2, false, routing)).toBe(true);
    expect(canDecideLane("standard", 1, false, routing)).toBe(true);
    expect(canDecideLane("standard", 9, false, routing)).toBe(false);
  });

  it("allows everyone when there is no lane or routing is off", () => {
    expect(canDecideLane(null, 9, false, routing)).toBe(true);
    expect(canDecideLane("senior", 9, false, { ...routing, enabled: false })).toBe(true);
    expect(canDecideLane("senior", 9, false, null)).toBe(true);
  });
});
