import { describe, it, expect } from "vitest";
import { metricValue } from "./storylines";

describe("storylines", () => {
  it("credit-scoring-v3 PSI drifts across 0.20 around day 18", () => {
    expect(metricValue("credit-scoring-v3", "psi", 0)).toBeLessThan(0.1);
    expect(metricValue("credit-scoring-v3", "psi", 17)).toBeLessThan(0.2);
    expect(metricValue("credit-scoring-v3", "psi", 20)).toBeGreaterThan(0.2);
  });

  it("fraud-detector-v2 stays healthy (psi never breaches 0.25)", () => {
    for (let d = 0; d < 30; d++) {
      expect(metricValue("fraud-detector-v2", "psi", d)).toBeLessThan(0.25);
    }
  });

  it("loan-approval-v1 subprime gini drops below 0.45 while overall stays in band", () => {
    const lateSubprime = metricValue("loan-approval-v1", "gini", 25, "subprime");
    const lateOverall = metricValue("loan-approval-v1", "gini", 25, "overall");
    expect(lateSubprime).toBeLessThan(0.45);
    expect(lateOverall).toBeGreaterThanOrEqual(0.45);
    expect(lateOverall).toBeLessThanOrEqual(0.75);
  });

  it("churn-propensity-v1 breaches psi>0.15 mid-window then recovers", () => {
    expect(metricValue("churn-propensity-v1", "psi", 15)).toBeGreaterThan(0.15);
    expect(metricValue("churn-propensity-v1", "psi", 28)).toBeLessThan(0.15);
  });

  it("is deterministic (same inputs -> same output)", () => {
    expect(metricValue("credit-scoring-v3", "psi", 10)).toBe(
      metricValue("credit-scoring-v3", "psi", 10),
    );
  });
});
