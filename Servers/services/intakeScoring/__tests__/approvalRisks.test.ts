jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import {
  buildModelRiskFromSuggestion,
  buildUseCaseRiskFromSuggestion,
  DEFAULT_RISK_CATEGORY,
  recomputeAssessmentForLevel,
} from "../approvalRisks";
import type { IntakeSuggestedRisk } from "../intakeSuggestions";
import type { IRiskAssessmentV2 } from "../../../domain.layer/interfaces/i.intakeSubmission";
import { ModelRiskCategory } from "../../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../../domain.layer/enums/model-risk-level.enum";

const APPROVED_AT = new Date("2026-10-21T15:30:00.000Z");
const CTX = { approverId: 7, approvedAt: APPROVED_AT, submissionId: 11 };

const suggestion = (overrides: Partial<IntakeSuggestedRisk> = {}): IntakeSuggestedRisk => ({
  id: "s1",
  source: "mit",
  name: "Biased ranking",
  description: "Rankings disadvantage some groups.",
  categories: ["Data privacy risk"],
  lifecyclePhase: "Deployment & integration",
  likelihood: "Likely",
  severity: "Major",
  impact: "Qualified applicants are rejected.",
  mitigationPlan: "Audit rankings each quarter.",
  implementationStrategy: "HR analytics owns the audit.",
  deadline: null,
  state: "accepted",
  ...overrides,
});

describe("buildUseCaseRiskFromSuggestion", () => {
  it("maps a suggestion onto the risk register", () => {
    const risk = buildUseCaseRiskFromSuggestion(suggestion(), { ...CTX, useCaseId: 42 });
    expect(risk).toMatchObject({
      risk_name: "Biased ranking",
      risk_description: "Rankings disadvantage some groups.",
      risk_category: ["Data privacy risk"],
      ai_lifecycle_phase: "Deployment & integration",
      likelihood: "Likely",
      severity: "Major",
      // 4 (Likely) + 3 * 4 (Major) = 16
      risk_level_autocalculated: "High risk",
      impact: "Qualified applicants are rejected.",
      mitigation_plan: "Audit rankings each quarter.",
      implementation_strategy: "HR analytics owns the audit.",
      risk_owner: 7,
      mitigation_status: "Not Started",
      projects: [42],
    });
    expect(risk.review_notes).toBe("Accepted from intake submission #11 (MIT AI Risk Repository).");
  });

  it("is due 90 days after approval without a deadline, else on its deadline", () => {
    expect(buildUseCaseRiskFromSuggestion(suggestion(), { ...CTX, useCaseId: 1 }).deadline).toBe(
      "2027-01-19",
    );
    expect(
      buildUseCaseRiskFromSuggestion(suggestion({ deadline: "2026-12-01" }), {
        ...CTX,
        useCaseId: 1,
      }).deadline,
    ).toBe("2026-12-01");
  });

  it("falls back to the register's default category and no phase", () => {
    const risk = buildUseCaseRiskFromSuggestion(
      suggestion({ categories: [], lifecyclePhase: undefined }),
      { ...CTX, useCaseId: 1 },
    );
    expect(risk.risk_category).toEqual([DEFAULT_RISK_CATEGORY]);
    expect(risk.ai_lifecycle_phase).toBeNull();
  });
});

describe("buildModelRiskFromSuggestion", () => {
  it("maps a suggestion onto a model risk owned by the approver", () => {
    const risk = buildModelRiskFromSuggestion(
      suggestion({
        modelRiskCategory: ModelRiskCategory.BIAS,
        modelRiskLevel: ModelRiskLevel.HIGH,
      }),
      { ...CTX, modelId: 9 },
    );
    expect(risk).toEqual({
      risk_name: "Biased ranking",
      description: "Rankings disadvantage some groups.",
      risk_category: "Bias & Fairness",
      risk_level: "High",
      status: "Open",
      owner: "7",
      target_date: "2027-01-19",
      likelihood: "Likely",
      impact: "Qualified applicants are rejected.",
      mitigation_plan: "Audit rankings each quarter.",
      model_id: 9,
    });
  });

  it("derives category and level when the suggestion has none", () => {
    const risk = buildModelRiskFromSuggestion(
      suggestion({ categories: [], likelihood: "Almost Certain", severity: "Catastrophic" }),
      { ...CTX, modelId: 9 },
    );
    expect(risk.risk_category).toBe("Compliance");
    expect(risk.risk_level).toBe("Critical");
  });
});

describe("recomputeAssessmentForLevel", () => {
  const assessment = (overrides: Partial<IRiskAssessmentV2> = {}): IRiskAssessmentV2 => ({
    version: 2,
    status: "complete",
    notRuleChecked: false,
    classificationLevel: "High risk",
    ruleMinimum: 70,
    ai: { runs: [], failedRuns: 0, validRuns: 5, median: 75, min: 70, max: 80, reasons: [] },
    finalScore: 75,
    source: "ai",
    rulesOnly: false,
    overallScore: 75,
    tier: "High",
    stageStartedAt: "x",
    scoredAt: "y",
    ...overrides,
  });

  it("raising High risk to Prohibited raises the floor to 90", () => {
    const a = recomputeAssessmentForLevel(assessment(), "Prohibited");
    expect(a).toMatchObject({
      classificationLevel: "Prohibited",
      ruleMinimum: 90,
      finalScore: 90,
      source: "rule_minimum",
      overallScore: 90,
      tier: "Critical",
    });
  });

  it("lowering Prohibited to Minimal risk lets the AI median through", () => {
    const a = recomputeAssessmentForLevel(
      assessment({
        classificationLevel: "Prohibited",
        ruleMinimum: 90,
        ai: { runs: [], failedRuns: 0, validRuns: 5, median: 40, min: 30, max: 50, reasons: [] },
        finalScore: 90,
      }),
      "Minimal risk",
    );
    expect(a).toMatchObject({ ruleMinimum: 0, finalScore: 40, source: "ai", tier: "Medium" });
  });

  it("a rules-only score becomes no score when the new minimum is 0", () => {
    const a = recomputeAssessmentForLevel(
      assessment({ status: "ai_not_configured", ai: null, rulesOnly: true, finalScore: 70 }),
      "Minimal risk",
    );
    expect(a).toMatchObject({ finalScore: null, tier: null, rulesOnly: false, overallScore: null });
  });

  it("ignores the AI median of a failed scoring stage", () => {
    const a = recomputeAssessmentForLevel(assessment({ status: "ai_failed" }), "Limited risk");
    expect(a).toMatchObject({ finalScore: 30, rulesOnly: true });
  });

  it("no level means not rule-checked", () => {
    const a = recomputeAssessmentForLevel(assessment(), null);
    expect(a).toMatchObject({ notRuleChecked: true, ruleMinimum: null, finalScore: 75 });
  });
});
