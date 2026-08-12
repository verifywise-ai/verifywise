import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

import { availableReadinessTools } from "./readinessFunctions";

describe("generate_recommendations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not resurrect the retired task/risk columns as always-failing checks or as the weakest dimension for a fully ready control", async () => {
    // Row shape as persisted post requirements-scoring rewrite: task_completion_score
    // and risk_mitigation_score are always NULL now, but the advisor's SELECT still
    // asks for them per Task 6 (kept as pass-through context, not scoring input).
    mockQuery.mockResolvedValue([
      [
        {
          control_id: 1,
          overall_score: 100,
          readiness_level: "ready",
          requirements_score: 100,
          evidence_quality_score: 100,
          evidence_count_score: 100,
          evidence_recency_score: 100,
          task_completion_score: null,
          risk_mitigation_score: null,
          recommendations: null,
        },
      ],
    ]);

    const result = await availableReadinessTools.generate_recommendations(
      { framework_type: "eu_ai_act" },
      1,
    );

    expect(result.recommendations).toHaveLength(1);
    const rec = result.recommendations[0];

    // The regression this guards: a fully-ready control must not get the
    // retired-column-driven actions just because those columns read NULL.
    expect(rec.actions).toEqual(["Continue maintaining current compliance posture"]);
    expect(rec.actions).not.toContain("Complete pending tasks linked to this control");
    expect(rec.actions).not.toContain("Address unmitigated risks linked to this control");

    // Same bug, same columns: weakest_dimension must not fall back to a NULL-derived
    // "task_completion" / "risk_mitigation" when the real evidence dimensions are all 100.
    expect(rec.weakest_dimension).not.toBe("task_completion");
    expect(rec.weakest_dimension).not.toBe("risk_mitigation");
  });

  it("still surfaces evidence-based actions when a real dimension is weak", async () => {
    mockQuery.mockResolvedValue([
      [
        {
          control_id: 2,
          overall_score: 20,
          readiness_level: "at_risk",
          requirements_score: 20,
          evidence_quality_score: 20,
          evidence_count_score: 10,
          evidence_recency_score: 10,
          task_completion_score: null,
          risk_mitigation_score: null,
          recommendations: null,
        },
      ],
    ]);

    const result = await availableReadinessTools.generate_recommendations(
      { framework_type: "iso_42001" },
      1,
    );

    const rec = result.recommendations[0];
    expect(rec.actions).toEqual([
      "Complete the remaining requirements for this control",
      "Upload evidence documents for this control",
      "Improve quality of existing evidence (add specifics, recent data)",
      "Update or replace outdated evidence with recent documents",
    ]);
    expect(rec.weakest_dimension).toBe("evidence_count");
  });

  it("recommends completing requirements for a control whose only weak dimension is requirements", async () => {
    // 0% requirement completion with perfect evidence scores 50/100 under the
    // 0.50/0.20/0.15/0.15 weighting. Before requirements_score was wired in,
    // this control was told to "continue maintaining current compliance
    // posture" and reported evidence_quality — a dimension sitting at 100 —
    // as its weakest.
    mockQuery.mockResolvedValue([
      [
        {
          control_id: 3,
          overall_score: 50,
          readiness_level: "at_risk",
          requirements_score: 0,
          evidence_quality_score: 100,
          evidence_count_score: 100,
          evidence_recency_score: 100,
          task_completion_score: null,
          risk_mitigation_score: null,
          recommendations: null,
        },
      ],
    ]);

    const result = await availableReadinessTools.generate_recommendations(
      { framework_type: "eu_ai_act" },
      1,
    );

    const rec = result.recommendations[0];
    expect(rec.actions).toEqual(["Complete the remaining requirements for this control"]);
    expect(rec.weakest_dimension).toBe("requirements");
  });

  it("does not fire the requirements action for a row whose requirements_score is NULL", async () => {
    // Rows written before the column existed read NULL. Treating NULL as 0
    // would make the requirements advice — and the "requirements" weakest
    // verdict — fire unconditionally, the same defect the retired task/risk
    // columns caused.
    mockQuery.mockResolvedValue([
      [
        {
          control_id: 4,
          overall_score: 100,
          readiness_level: "ready",
          requirements_score: null,
          evidence_quality_score: 100,
          evidence_count_score: 100,
          evidence_recency_score: 100,
          task_completion_score: null,
          risk_mitigation_score: null,
          recommendations: null,
        },
      ],
    ]);

    const result = await availableReadinessTools.generate_recommendations(
      { framework_type: "eu_ai_act" },
      1,
    );

    const rec = result.recommendations[0];
    expect(rec.actions).toEqual(["Continue maintaining current compliance posture"]);
  });

  it("still selects requirements_score and scopes by organization_id", async () => {
    mockQuery.mockResolvedValue([[]]);

    await availableReadinessTools.generate_recommendations({ framework_type: "eu_ai_act" }, 1);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("requirements_score");
    expect(sql).toContain("organization_id = :organizationId");

    const options = mockQuery.mock.calls[0][1] as { replacements: Record<string, unknown> };
    expect(options.replacements.organizationId).toBe(1);
  });

  // upsertControlScoreQuery stopped writing these two columns in the
  // requirements-scoring rewrite, and nothing in this file reads them from the
  // result any more. Selecting them invites the next reader to branch on a
  // column that is NULL for every row scored since.
  it("does not select the retired task and risk columns", async () => {
    mockQuery.mockResolvedValue([[]]);

    await availableReadinessTools.generate_recommendations({ framework_type: "eu_ai_act" }, 1);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).not.toContain("task_completion_score");
    expect(sql).not.toContain("risk_mitigation_score");
  });
});
