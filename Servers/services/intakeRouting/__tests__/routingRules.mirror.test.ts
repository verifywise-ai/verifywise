// Servers/services/intakeRouting/__tests__/routingRules.mirror.test.ts
// Runs the cases the client copy in
// Clients/src/application/utils/intakeRouting/routingRules.ts is tested
// against, so the two cannot drift apart without one suite failing.
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAND_LOWER_BOUND,
  DEFAULT_ROUTING,
  canDecideLane,
  laneFor,
  laneReviewerIdsFor,
} from "../routingRules";
import { laneAtDecision, laneOnRecord } from "../decisionGate";
import type { IFormRouting } from "../../../domain.layer/interfaces/i.intakeForm";
import type {
  ISubmissionRouting,
  ReviewLane,
  RoutingReason,
} from "../../../domain.layer/interfaces/i.intakeSubmission";

type Cfg = IFormRouting | null;
type Stored = ISubmissionRouting | null;
type Effective = Parameters<typeof laneOnRecord>[2];
type LaneResult = { lane: ReviewLane | null; reason: RoutingReason | null };
type GateCase = { stored: Stored; cfg: Cfg; effective: Effective; expected: LaneResult };

const FIXTURE = join(__dirname, "../__fixtures__/routingRulesCases.json");
const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  laneFor: Array<{
    input: Parameters<typeof laneFor>[0];
    cfg: Parameters<typeof laneFor>[1];
    expected: LaneResult;
  }>;
  canDecideLane: Array<{
    lane: ReviewLane | null;
    userId: number;
    isAdmin: boolean;
    cfg: Cfg;
    expected: boolean;
  }>;
  laneReviewerIdsFor: Array<{ lane: ReviewLane | null; cfg: Cfg; expected: number[] }>;
  laneOnRecord: GateCase[];
  laneAtDecision: GateCase[];
};

describe("routingRules shared cases", () => {
  it.each(cases.laneFor)("laneFor %#", ({ input, cfg, expected }) => {
    expect(laneFor(input, cfg)).toEqual(expected);
  });

  it.each(cases.canDecideLane)("canDecideLane %#", ({ lane, userId, isAdmin, cfg, expected }) => {
    expect(canDecideLane(lane, userId, isAdmin, cfg)).toBe(expected);
  });

  it.each(cases.laneReviewerIdsFor)("laneReviewerIdsFor %#", ({ lane, cfg, expected }) => {
    expect(laneReviewerIdsFor(lane, cfg)).toEqual(expected);
  });

  it.each(cases.laneOnRecord)("laneOnRecord %#", ({ stored, cfg, effective, expected }) => {
    expect(laneOnRecord(stored, cfg, effective)).toEqual(expected);
  });

  it.each(cases.laneAtDecision)("laneAtDecision %#", ({ stored, cfg, effective, expected }) => {
    expect(laneAtDecision(stored, cfg, effective)).toEqual(expected);
  });

  it("keeps the defaults and band bounds the client copies", () => {
    expect(DEFAULT_ROUTING).toEqual({ threshold: 50, closeCallMargin: 10, secondReviewRate: 10 });
    expect(BAND_LOWER_BOUND).toEqual({ Low: 0, Medium: 26, High: 51, Critical: 76 });
  });
});
