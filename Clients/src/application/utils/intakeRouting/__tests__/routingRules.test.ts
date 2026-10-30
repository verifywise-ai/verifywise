import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAND_LOWER_BOUND,
  DEFAULT_ROUTING,
  canDecideLane,
  entityLevel,
  laneAtDecision,
  laneFor,
  laneOnRecord,
  laneReviewerIdsFor,
} from "../routingRules";
import type {
  FormRouting,
  ReviewLane,
  RoutingReason,
  SubmissionRouting,
} from "../../../../domain/types/intakeRouting";

// The server suite runs the same cases against Servers/services/intakeRouting,
// so the two copies cannot drift apart without one suite failing.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  HERE,
  "../../../../../../Servers/services/intakeRouting/__fixtures__/routingRulesCases.json",
);
type Cfg = FormRouting | null;
type Stored = Pick<SubmissionRouting, "lane" | "reason"> | null;
type Effective = Parameters<typeof laneOnRecord>[2];
type LaneResult = { lane: ReviewLane | null; reason: RoutingReason | null };

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
  laneOnRecord: Array<{ stored: Stored; cfg: Cfg; effective: Effective; expected: LaneResult }>;
  laneAtDecision: Array<{ stored: Stored; cfg: Cfg; effective: Effective; expected: LaneResult }>;
  entityLevel: Array<{
    entityType: string;
    runLevel: string | null;
    mapped: string | null;
    expected: string | null;
  }>;
};

describe("routingRules client mirror", () => {
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

  // The server runs these through getSubmissionPreview, where the mapped answer
  // reaches entityLevel as the entity data's ai_risk_classification.
  it.each(cases.entityLevel)("entityLevel %#", ({ entityType, runLevel, mapped, expected }) => {
    const entityData = mapped === null ? {} : { ai_risk_classification: mapped };
    expect(entityLevel(entityType, runLevel, entityData)).toBe(expected);
  });

  it("keeps the server defaults and band bounds", () => {
    expect(DEFAULT_ROUTING).toEqual({ threshold: 50, closeCallMargin: 10, secondReviewRate: 10 });
    expect(BAND_LOWER_BOUND).toEqual({ Low: 0, Medium: 26, High: 51, Critical: 76 });
  });
});
