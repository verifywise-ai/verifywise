import { describe, it, expect } from "@jest/globals";
import {
  buildDecisionRecord,
  laneAtDecision,
  laneOnRecord,
  pickSecondReview,
} from "../decisionGate";
import type { IFormRouting } from "../../../domain.layer/interfaces/i.intakeForm";
import type {
  IRiskAssessmentV2,
  ISubmissionRouting,
} from "../../../domain.layer/interfaces/i.intakeSubmission";

const CFG: IFormRouting = {
  enabled: true,
  seniorReviewerIds: [1],
  standardReviewerIds: [2],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};
const stored = (overrides: Partial<ISubmissionRouting> = {}): ISubmissionRouting => ({
  lane: "standard",
  reason: "below_threshold",
  score: 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-22T00:00:00.000Z",
  ...overrides,
});
const effective = (overrides: object = {}) => ({
  level: "Minimal risk",
  finalScore: 20,
  scoringStatus: "complete",
  bandInForce: null,
  ...overrides,
});

describe("laneAtDecision", () => {
  it("is senior when the effective level is Prohibited", () => {
    expect(
      laneAtDecision(stored(), CFG, effective({ level: "Prohibited", finalScore: 90 })),
    ).toEqual({ lane: "senior", reason: "prohibited" });
  });

  it("is senior when the band in force lifts the score over the threshold", () => {
    expect(laneAtDecision(stored(), CFG, effective({ bandInForce: "High" }))).toEqual({
      lane: "senior",
      reason: "close_call",
    });
    expect(laneAtDecision(stored(), CFG, effective({ bandInForce: "Critical" }))).toEqual({
      lane: "senior",
      reason: "at_or_above_threshold",
    });
  });

  it("a band in force below the score's band leaves the score alone", () => {
    expect(
      laneAtDecision(stored(), CFG, effective({ finalScore: 20, bandInForce: "Low" })),
    ).toEqual({ lane: "standard", reason: "below_threshold" });
  });

  it("stays senior when stored senior, whatever the effective values", () => {
    expect(
      laneAtDecision(
        stored({ lane: "senior", reason: "escalated" }),
        CFG,
        effective({ level: "Minimal risk", finalScore: 5 }),
      ),
    ).toEqual({ lane: "senior", reason: "escalated" });
  });

  it("keeps the stored reason when it stays standard", () => {
    expect(laneAtDecision(stored(), CFG, effective())).toEqual({
      lane: "standard",
      reason: "below_threshold",
    });
  });

  it("is null only when routing is off", () => {
    expect(laneAtDecision(stored(), { ...CFG, enabled: false }, effective())).toEqual({
      lane: null,
      reason: null,
    });
    expect(laneAtDecision(null, null, effective({ level: "Prohibited" }))).toEqual({
      lane: null,
      reason: null,
    });
  });

  it("with no lane stored, routes on the effective values", () => {
    expect(laneAtDecision(null, CFG, effective({ level: "Prohibited" }))).toEqual({
      lane: "senior",
      reason: "prohibited",
    });
    expect(laneAtDecision(null, CFG, effective({ bandInForce: "Critical" }))).toEqual({
      lane: "senior",
      reason: "at_or_above_threshold",
    });
    expect(laneAtDecision(null, CFG, effective())).toEqual({
      lane: "standard",
      reason: "below_threshold",
    });
  });

  it("a score still running counts as no score", () => {
    expect(
      laneAtDecision(null, CFG, effective({ finalScore: 20, scoringStatus: "pending" })),
    ).toEqual({ lane: "senior", reason: "no_score" });
    expect(laneAtDecision(null, CFG, effective({ finalScore: null }))).toEqual({
      lane: "senior",
      reason: "no_score",
    });
  });
});

describe("laneOnRecord", () => {
  it("keeps a stored lane without re-checking it", () => {
    expect(laneOnRecord(stored(), CFG, effective({ level: "Prohibited" }))).toEqual({
      lane: "standard",
      reason: "below_threshold",
    });
  });

  it("with no lane stored, routes on the current values", () => {
    expect(laneOnRecord(null, CFG, effective({ scoringStatus: "pending" }))).toEqual({
      lane: "senior",
      reason: "no_score",
    });
    expect(laneOnRecord(null, CFG, effective())).toEqual({
      lane: "standard",
      reason: "below_threshold",
    });
  });

  it("is null when routing is off", () => {
    expect(laneOnRecord(stored(), { ...CFG, enabled: false }, effective())).toEqual({
      lane: null,
      reason: null,
    });
  });
});

const assessment = (finalScore: number | null): IRiskAssessmentV2 => ({
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "Limited risk",
  ruleMinimum: 30,
  ai: null,
  finalScore,
  source: "rule_minimum",
  rulesOnly: true,
  overallScore: finalScore,
  tier: null,
  stageStartedAt: "x",
  scoredAt: "y",
});

describe("buildDecisionRecord", () => {
  it("without an override the computed band is in force", () => {
    expect(
      buildDecisionRecord({
        level: "Limited risk",
        assessment: assessment(40),
        override: null,
        lane: "standard",
      }),
    ).toEqual({
      level: "Limited risk",
      computedBand: "Medium",
      bandInForce: "Medium",
      bandChanged: false,
      overriddenBy: null,
      lane: "standard",
    });
  });

  it("an override to another band is recorded with who set it", () => {
    expect(
      buildDecisionRecord({
        level: "Limited risk",
        assessment: assessment(40),
        override: { tier: "High", overriddenBy: 3 },
        lane: null,
      }),
    ).toEqual({
      level: "Limited risk",
      computedBand: "Medium",
      bandInForce: "High",
      bandChanged: true,
      overriddenBy: 3,
      lane: null,
    });
  });

  it("no score: no computed band", () => {
    const record = buildDecisionRecord({
      level: null,
      assessment: null,
      override: null,
      lane: null,
    });
    expect(record).toMatchObject({ computedBand: null, bandInForce: null, bandChanged: false });
  });
});

describe("pickSecondReview", () => {
  it("rate 0 never picks", () => {
    for (let i = 0; i < 50; i++) expect(pickSecondReview(0)).toBe(false);
  });

  it("rate 100 always picks", () => {
    for (let i = 0; i < 50; i++) expect(pickSecondReview(100)).toBe(true);
  });

  it("picks when the draw is below the rate", () => {
    expect(pickSecondReview(10, () => 9)).toBe(true);
    expect(pickSecondReview(10, () => 10)).toBe(false);
  });

  it("draws from 0 to 99", () => {
    const seen: number[] = [];
    pickSecondReview(10, (max) => {
      seen.push(max);
      return 0;
    });
    expect(seen).toEqual([100]);
  });
});
