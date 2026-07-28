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
      "Upload evidence documents for this control",
      "Improve quality of existing evidence (add specifics, recent data)",
      "Update or replace outdated evidence with recent documents",
    ]);
    expect(rec.weakest_dimension).toBe("evidence_count");
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
});
