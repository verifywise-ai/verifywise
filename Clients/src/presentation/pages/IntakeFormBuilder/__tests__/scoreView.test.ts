import { scoreViewFor } from "../assessment/scoreView";
import type { RiskAssessmentV2 } from "../../../../application/repository/intakeForm.repository";

const base: RiskAssessmentV2 = {
  version: 2,
  status: "ai_not_configured",
  notRuleChecked: false,
  classificationLevel: "Limited risk",
  ruleMinimum: 30,
  ai: null,
  keyword: { overallScore: 45, dimensions: [] },
  finalScore: 45,
  source: "keyword",
  rulesOnly: false,
  overallScore: 45,
  tier: "Medium",
  stageStartedAt: "2026-10-21T10:00:00.000Z",
  scoredAt: "2026-10-21T10:01:00.000Z",
};

describe("scoreViewFor with a keyword score", () => {
  it("uses the keyword score when the form has no LLM key", () => {
    expect(scoreViewFor(base, "Limited risk")).toEqual({
      ruleMinimum: 30,
      finalScore: 45,
      band: "Medium",
      source: "keyword",
      rulesOnly: false,
    });
    expect(scoreViewFor(base, null)).toMatchObject({ finalScore: 45, source: "keyword" });
  });

  it("re-floors it under a higher level", () => {
    expect(scoreViewFor(base, "High risk")).toMatchObject({
      finalScore: 70,
      band: "High",
      source: "rule_minimum",
      rulesOnly: false,
    });
  });

  it("ignores a keyword score unless the form has no key", () => {
    expect(scoreViewFor({ ...base, status: "ai_failed" }, "Limited risk")).toMatchObject({
      finalScore: 30,
      source: "rule_minimum",
      rulesOnly: true,
    });
    const ai = {
      runs: [20],
      failedRuns: 0,
      validRuns: 1,
      median: 20,
      min: 20,
      max: 20,
      reasons: [],
    };
    expect(scoreViewFor({ ...base, status: "complete", ai }, null)).toMatchObject({
      finalScore: 20,
      source: "ai",
    });
  });

  it("without a stored keyword score keeps the rules-only result", () => {
    expect(scoreViewFor({ ...base, keyword: undefined }, "Limited risk")).toMatchObject({
      finalScore: 30,
      rulesOnly: true,
    });
  });
});
