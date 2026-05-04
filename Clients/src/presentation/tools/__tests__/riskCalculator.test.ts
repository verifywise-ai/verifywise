import { describe, it, expect } from "vitest";
import { RiskCalculator } from "../riskCalculator";
import { RiskLikelihood, RiskSeverity } from "../../components/RiskLevel/riskValues";
import { RISK_LABELS } from "../../components/RiskLevel/constants";

describe("RiskCalculator.getRiskLevel", () => {
  it("(Rare, Negligible) → score 4 → No risk", () => {
    // 1*1 + 1*3 = 4
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Rare, RiskSeverity.Negligible);
    expect(result.level).toBe("No risk");
    expect(result.color).toBe(RISK_LABELS.noRisk.color);
  });

  it("(Rare, Minor) → score 7 → Low risk", () => {
    // 1*1 + 2*3 = 7
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Rare, RiskSeverity.Minor);
    expect(result.level).toBe("Low risk");
    expect(result.color).toBe(RISK_LABELS.low.color);
  });

  it("(Unlikely, Minor) → score 8 → Low risk (upper boundary)", () => {
    // 2*1 + 2*3 = 8
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Unlikely, RiskSeverity.Minor);
    expect(result.level).toBe("Low risk");
    expect(result.color).toBe(RISK_LABELS.low.color);
  });

  it("(Rare, Moderate) → score 10 → Medium risk", () => {
    // 1*1 + 3*3 = 10
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Rare, RiskSeverity.Moderate);
    expect(result.level).toBe("Medium risk");
    expect(result.color).toBe(RISK_LABELS.medium.color);
  });

  it("(Possible, Moderate) → score 12 → Medium risk (upper boundary)", () => {
    // 3*1 + 3*3 = 12
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Possible, RiskSeverity.Moderate);
    expect(result.level).toBe("Medium risk");
    expect(result.color).toBe(RISK_LABELS.medium.color);
  });

  it("(Likely, Major) → score 16 → High risk (upper boundary)", () => {
    // 4*1 + 4*3 = 16
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Likely, RiskSeverity.Major);
    expect(result.level).toBe("High risk");
    expect(result.color).toBe(RISK_LABELS.high.color);
  });

  it("(AlmostCertain, Catastrophic) → score 20 → Very high risk", () => {
    // 5*1 + 5*3 = 20
    const result = RiskCalculator.getRiskLevel(
      RiskLikelihood.AlmostCertain,
      RiskSeverity.Catastrophic,
    );
    expect(result.level).toBe("Very high risk");
    expect(result.color).toBe(RISK_LABELS.critical.color);
  });

  it("(Unlikely, Negligible) → score 5 → Low risk (lower boundary)", () => {
    // 2*1 + 1*3 = 5
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.Unlikely, RiskSeverity.Negligible);
    expect(result.level).toBe("Low risk");
    expect(result.color).toBe(RISK_LABELS.low.color);
  });

  it("(AlmostCertain, Major) → score 17 → Very high risk (lower boundary)", () => {
    // 5*1 + 4*3 = 17
    const result = RiskCalculator.getRiskLevel(RiskLikelihood.AlmostCertain, RiskSeverity.Major);
    expect(result.level).toBe("Very high risk");
    expect(result.color).toBe(RISK_LABELS.critical.color);
  });
});
