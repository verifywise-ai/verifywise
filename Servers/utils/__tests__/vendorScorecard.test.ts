import { calculateVendorRiskScore } from "../vendorScorecard.utils";

describe("calculateVendorRiskScore", () => {
  it("is null when no scorecard answer is set", () => {
    expect(calculateVendorRiskScore({})).toBeNull();
    expect(
      calculateVendorRiskScore({
        data_sensitivity: null,
        business_criticality: "",
        past_issues: undefined,
        regulatory_exposure: null,
      }),
    ).toBeNull();
  });

  it("is 0 when every answer is the lowest one", () => {
    expect(
      calculateVendorRiskScore({
        data_sensitivity: "None",
        past_issues: "None",
        regulatory_exposure: "None",
      }),
    ).toBe(0);
  });

  it("is 100 for the highest answers", () => {
    expect(
      calculateVendorRiskScore({
        data_sensitivity: "Health data (e.g. HIPAA)",
        business_criticality: "High (critical to core services or products)",
        past_issues: "Major incident (e.g. data breach, legal issue)",
        regulatory_exposure: "GDPR (EU)",
      }),
    ).toBe(100);
  });

  it("weights each answer against its scale's maximum, as the client preview does", () => {
    // 0.3 * 2/5 + 0.3 * 2/3 + 0.2 * 1/3 + 0.2 * 0 = 0.12 + 0.2 + 0.0667 = 38.67 -> 39
    expect(
      calculateVendorRiskScore({
        data_sensitivity: "Personally identifiable information (PII)",
        business_criticality: "Medium (affects operations but is replaceable)",
        past_issues: "Minor incident (e.g. small delay, minor bug)",
        regulatory_exposure: "None",
      }),
    ).toBe(39);
    // one answer only: 0.3 * 4/5 = 24
    expect(calculateVendorRiskScore({ data_sensitivity: "Financial data" })).toBe(24);
  });
});
