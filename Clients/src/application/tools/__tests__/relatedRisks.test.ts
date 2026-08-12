import { describe, expect, it } from "vitest";
import { findRelatedRisks } from "../relatedRisks";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { AiLifeCyclePhase } from "../../../domain/enums/aiLifeCyclePhase.enum";
import { RiskLevelAutoCalculated } from "../../../domain/enums/riskLevelAutoCalculated.enum";

/**
 * Builds a risk with every scoring signal switched off by default, so each
 * test only turns on the signals it is about.
 */
const makeRisk = (overrides: Partial<RiskModel> & { id: number }): RiskModel =>
  ({
    risk_name: `Risk ${overrides.id}`,
    risk_category: [],
    ai_lifecycle_phase: "" as AiLifeCyclePhase,
    controls_mapping: "",
    assessment_mapping: "",
    mitigation_plan: "",
    risk_level_autocalculated: RiskLevelAutoCalculated.MediumRisk,
    projects: [],
    ...overrides,
  }) as RiskModel;

describe("findRelatedRisks", () => {
  it("ranks a higher-scoring match above a lower-scoring one", () => {
    const subject = makeRisk({
      id: 1,
      risk_category: ["Bias & Fairness"],
      controls_mapping: "AC-1",
    });
    const twoSignals = makeRisk({
      id: 2,
      risk_category: ["Bias & Fairness"],
      controls_mapping: "AC-1",
    });
    const oneSignal = makeRisk({ id: 3, risk_category: ["Bias & Fairness"] });

    const result = findRelatedRisks(subject, [oneSignal, twoSignals]);

    expect(result.map((r) => r.risk.id)).toEqual([2, 3]);
    expect(result[0].score).toBe(5);
    expect(result[1].score).toBe(3);
  });

  it("breaks a score tie by risk level, then by id", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const medium = makeRisk({
      id: 2,
      risk_category: ["Security"],
      risk_level_autocalculated: RiskLevelAutoCalculated.MediumRisk,
    });
    const highLaterId = makeRisk({
      id: 9,
      risk_category: ["Security"],
      risk_level_autocalculated: RiskLevelAutoCalculated.HighRisk,
    });
    const highEarlierId = makeRisk({
      id: 4,
      risk_category: ["Security"],
      risk_level_autocalculated: RiskLevelAutoCalculated.HighRisk,
    });

    const result = findRelatedRisks(subject, [medium, highLaterId, highEarlierId]);

    expect(result.map((r) => r.risk.id)).toEqual([4, 9, 2]);
  });

  it("excludes the subject itself by id", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const sameRiskInList = makeRisk({ id: 1, risk_category: ["Security"] });

    expect(findRelatedRisks(subject, [sameRiskInList])).toEqual([]);
  });

  it("returns an empty array when no signal matches", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const unrelated = makeRisk({ id: 2, risk_category: ["Data Quality"] });

    expect(findRelatedRisks(subject, [unrelated])).toEqual([]);
  });

  it("caps the result at 5", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const candidates = [2, 3, 4, 5, 6, 7, 8].map((id) =>
      makeRisk({ id, risk_category: ["Security"] }),
    );

    expect(findRelatedRisks(subject, candidates)).toHaveLength(5);
  });

  it("does not treat two empty mappings as a match", () => {
    const subject = makeRisk({ id: 1, controls_mapping: "   ", assessment_mapping: "" });
    const candidate = makeRisk({ id: 2, controls_mapping: "", assessment_mapping: "" });

    expect(findRelatedRisks(subject, [candidate])).toEqual([]);
  });

  it('does not treat the unset "0" mapping sentinel as a match', () => {
    const subject = makeRisk({ id: 1, controls_mapping: "0", assessment_mapping: "0" });
    const candidate = makeRisk({ id: 2, controls_mapping: "0", assessment_mapping: "0" });

    expect(findRelatedRisks(subject, [candidate])).toEqual([]);
  });

  it("matches categories and mappings case-insensitively, ignoring surrounding space", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"], controls_mapping: "AC-1" });
    const candidate = makeRisk({
      id: 2,
      risk_category: [" security "],
      controls_mapping: " ac-1 ",
    });

    expect(findRelatedRisks(subject, [candidate])[0].score).toBe(5);
  });

  it("uses the related risk's mitigation plan as the recommendation when it has one", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const candidate = makeRisk({
      id: 2,
      risk_category: ["Security"],
      mitigation_plan: "Rotate the signing keys quarterly",
    });

    expect(findRelatedRisks(subject, [candidate])[0].recommendation).toBe(
      "Rotate the signing keys quarterly",
    );
  });

  it("falls back to the template of the highest-weight signal when there is no mitigation plan", () => {
    const subject = makeRisk({
      id: 1,
      risk_category: ["Security"],
      controls_mapping: "AC-1",
    });
    const candidate = makeRisk({
      id: 2,
      risk_category: ["Security"],
      controls_mapping: "AC-1",
    });

    expect(findRelatedRisks(subject, [candidate])[0].recommendation).toBe(
      "Same category (Security) — re-check this risk's likelihood and severity for consistency.",
    );
  });

  it("falls back to the control template when only the control matches", () => {
    const subject = makeRisk({ id: 1, controls_mapping: "AC-1" });
    const candidate = makeRisk({ id: 2, controls_mapping: "AC-1" });

    expect(findRelatedRisks(subject, [candidate])[0].recommendation).toBe(
      "Shared control AC-1 — if that control changed, re-assess this risk.",
    );
  });

  it("names the matched values in the reason badges", () => {
    const subject = makeRisk({
      id: 1,
      risk_category: ["Bias & Fairness", "Security"],
      ai_lifecycle_phase: AiLifeCyclePhase.ModelDevelopmentAndTraining,
      controls_mapping: "AC-1",
      assessment_mapping: "Q1.2",
      projects: [7],
    });
    const candidate = makeRisk({
      id: 2,
      risk_category: ["Bias & Fairness", "Security"],
      ai_lifecycle_phase: AiLifeCyclePhase.ModelDevelopmentAndTraining,
      controls_mapping: "AC-1",
      assessment_mapping: "Q1.2",
      projects: [7, 8],
    });

    const [match] = findRelatedRisks(subject, [candidate]);

    expect(match.score).toBe(10);
    expect(match.reasons).toEqual([
      "Shared category: Bias & Fairness, Security",
      "Shared control: AC-1",
      "Shared assessment: Q1.2",
      "Same lifecycle phase: Model development & training",
      "Same project",
    ]);
  });

  it("tolerates risks whose array fields are missing", () => {
    const subject = makeRisk({ id: 1, risk_category: ["Security"] });
    const brokenRow = {
      id: 2,
      risk_name: "No arrays",
      controls_mapping: "",
      assessment_mapping: "",
      mitigation_plan: "",
    } as unknown as RiskModel;

    expect(() => findRelatedRisks(subject, [brokenRow])).not.toThrow();
    expect(findRelatedRisks(subject, [brokenRow])).toEqual([]);
  });
});
