import { describe, expect, it } from "vitest";
import {
  computeModelRiskLevel,
  MODEL_RISK_LIKELIHOODS,
  MODEL_RISK_SEVERITIES,
  modelRiskSaveBody,
} from "../modelRiskLevel";
import { ModelRiskLevel } from "../../../domain/interfaces/i.modelRisk";

// Same table as the server's calculateModelRiskLevel test: likelihood rows,
// severity columns Negligible ... Catastrophic.
const EXPECTED: Record<string, string[]> = {
  "Rare": ["Low", "Low", "Medium", "High", "High"],
  "Unlikely": ["Low", "Low", "Medium", "High", "Critical"],
  "Possible": ["Low", "Medium", "Medium", "High", "Critical"],
  "Likely": ["Low", "Medium", "High", "High", "Critical"],
  "Almost Certain": ["Low", "Medium", "High", "Critical", "Critical"],
};

describe("computeModelRiskLevel", () => {
  const cases = MODEL_RISK_LIKELIHOODS.flatMap((l) =>
    MODEL_RISK_SEVERITIES.map((s, i) => [l, s, EXPECTED[l][i]] as const),
  );

  it("covers all 25 combinations", () => {
    expect(cases).toHaveLength(25);
  });

  it.each(cases)("%s x %s is %s", (likelihood, severity, level) => {
    expect(computeModelRiskLevel(likelihood, severity)).toBe(level);
  });

  it("is null while either is missing or not a label", () => {
    expect(computeModelRiskLevel("", "Minor")).toBeNull();
    expect(computeModelRiskLevel("Likely", null)).toBeNull();
    expect(computeModelRiskLevel("Confirmed", "Minor")).toBeNull();
  });
});

describe("modelRiskSaveBody", () => {
  const base = { risk_name: "Drift", risk_level: ModelRiskLevel.LOW };

  it("sends no level once likelihood and severity are both set", () => {
    expect(modelRiskSaveBody({ ...base, likelihood: "Likely", severity: "Major" }, true)).toEqual({
      risk_name: "Drift",
      likelihood: "Likely",
      severity: "Major",
    });
  });

  it("keeps the picked level of an older risk without a severity", () => {
    expect(modelRiskSaveBody({ ...base, likelihood: "Likely", severity: "" }, true)).toEqual({
      risk_name: "Drift",
      likelihood: "Likely",
      risk_level: ModelRiskLevel.LOW,
    });
  });

  it("never sends a picked level for a new risk", () => {
    expect(modelRiskSaveBody({ ...base, likelihood: "", severity: "" }, false)).toEqual({
      risk_name: "Drift",
    });
  });
});
