import { describe, it, expect } from "vitest";
import {
  calculateVendorRiskScore,
  getRiskScoreLevel,
  getRiskScoreColor,
} from "../vendorScorecard.utils";
import {
  DataSensitivity,
  BusinessCriticality,
  PastIssues,
  RegulatoryExposure,
} from "../../enums/status.enum";

describe("calculateVendorRiskScore", () => {
  it("returns 0 for null input", () => {
    expect(calculateVendorRiskScore(null as any)).toBe(0);
  });

  it("returns 0 for undefined input", () => {
    expect(calculateVendorRiskScore(undefined as any)).toBe(0);
  });

  it("returns 0 for non-object input", () => {
    expect(calculateVendorRiskScore("string" as any)).toBe(0);
  });

  it("returns 0 for empty object", () => {
    expect(calculateVendorRiskScore({})).toBe(0);
  });

  it("calculates minimum possible score", () => {
    const score = calculateVendorRiskScore({
      data_sensitivity: DataSensitivity.None,
      business_criticality: BusinessCriticality.Low,
      past_issues: PastIssues.None,
      regulatory_exposure: RegulatoryExposure.None,
    });
    // Low = 1/3 * 0.3 = 0.1 → 10%
    expect(score).toBe(10);
  });

  it("calculates maximum risk score correctly", () => {
    const score = calculateVendorRiskScore({
      data_sensitivity: DataSensitivity.HealthData,
      business_criticality: BusinessCriticality.High,
      past_issues: PastIssues.MajorIncident,
      regulatory_exposure: RegulatoryExposure.EUAIAct,
    });
    expect(score).toBe(100);
  });

  it("calculates correct moderate score", () => {
    const score = calculateVendorRiskScore({
      data_sensitivity: DataSensitivity.PII,
      business_criticality: BusinessCriticality.Medium,
      past_issues: PastIssues.MinorIncident,
      regulatory_exposure: RegulatoryExposure.GDPR,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("handles string values that are not in enums", () => {
    const score = calculateVendorRiskScore({
      data_sensitivity: "UnknownValue",
      business_criticality: "UnknownValue",
      past_issues: "UnknownValue",
      regulatory_exposure: "UnknownValue",
    });
    expect(score).toBe(0);
  });

  it("handles partial data with only data_sensitivity", () => {
    const score = calculateVendorRiskScore({
      data_sensitivity: DataSensitivity.PII,
    });
    expect(score).toBeGreaterThan(0);
  });
});

describe("getRiskScoreLevel", () => {
  it('returns "Very Low" for scores below 20', () => {
    expect(getRiskScoreLevel(0)).toBe("Very Low");
    expect(getRiskScoreLevel(19)).toBe("Very Low");
  });

  it('returns "Low" for scores 20-39', () => {
    expect(getRiskScoreLevel(20)).toBe("Low");
    expect(getRiskScoreLevel(39)).toBe("Low");
  });

  it('returns "Medium" for scores 40-59', () => {
    expect(getRiskScoreLevel(40)).toBe("Medium");
    expect(getRiskScoreLevel(59)).toBe("Medium");
  });

  it('returns "High" for scores 60-79', () => {
    expect(getRiskScoreLevel(60)).toBe("High");
    expect(getRiskScoreLevel(79)).toBe("High");
  });

  it('returns "Very High" for scores 80+', () => {
    expect(getRiskScoreLevel(80)).toBe("Very High");
    expect(getRiskScoreLevel(100)).toBe("Very High");
  });
});

describe("getRiskScoreColor", () => {
  it('returns "#33691E" for very low risk', () => {
    expect(getRiskScoreColor(0)).toBe("#33691E");
    expect(getRiskScoreColor(19)).toBe("#33691E");
  });

  it('returns "#2E7D32" for low risk', () => {
    expect(getRiskScoreColor(20)).toBe("#2E7D32");
  });

  it('returns "#8D6E63" for medium risk', () => {
    expect(getRiskScoreColor(40)).toBe("#8D6E63");
  });

  it('returns "#E65100" for high risk', () => {
    expect(getRiskScoreColor(60)).toBe("#E65100");
  });

  it('returns "#B71C1C" for very high risk', () => {
    expect(getRiskScoreColor(80)).toBe("#B71C1C");
    expect(getRiskScoreColor(100)).toBe("#B71C1C");
  });
});
