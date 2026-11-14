import { validateRiskLevelConsistency } from "../validations/riskValidation.utils";

describe("validateRiskLevelConsistency", () => {
  it("accepts a stored legacy 'Very low risk' at Rare x Negligible", () => {
    expect(validateRiskLevelConsistency("Negligible", "Rare", "Very low risk").isValid).toBe(true);
  });

  it("accepts 'No risk' at Rare x Negligible", () => {
    expect(validateRiskLevelConsistency("Negligible", "Rare", "No risk").isValid).toBe(true);
  });

  it("still rejects a genuinely inconsistent level", () => {
    const r = validateRiskLevelConsistency("Negligible", "Rare", "High risk");
    expect(r.isValid).toBe(false);
    expect(r.code).toBe("INCONSISTENT_RISK_LEVEL");
  });

  it("does not accept 'Very low risk' where the score is above 4", () => {
    expect(validateRiskLevelConsistency("Major", "Likely", "Very low risk").isValid).toBe(false);
  });
});
