import { describe, it, expect } from "vitest";
import { getEffectiveRiskLevel, riskLevelBucket, riskLevelRank } from "../riskLevel";

describe("getEffectiveRiskLevel", () => {
  it("prefers the current level when set", () => {
    expect(
      getEffectiveRiskLevel({
        current_risk_level: "Low risk",
        risk_level_autocalculated: "High risk",
      }),
    ).toBe("Low risk");
  });

  it("falls back to the inherent level when current is null, empty or undefined", () => {
    expect(
      getEffectiveRiskLevel({ current_risk_level: null, risk_level_autocalculated: "High risk" }),
    ).toBe("High risk");
    expect(
      getEffectiveRiskLevel({ current_risk_level: "", risk_level_autocalculated: "Medium risk" }),
    ).toBe("Medium risk");
    expect(getEffectiveRiskLevel({ risk_level_autocalculated: "No risk" })).toBe("No risk");
  });

  it("returns an empty string when neither is set", () => {
    expect(getEffectiveRiskLevel({})).toBe("");
  });
});

describe("riskLevelBucket", () => {
  it.each([
    ["Very high risk", "veryHigh"],
    ["High risk", "high"],
    ["Medium risk", "medium"],
    ["Low risk", "low"],
    ["Very low risk", "veryLow"],
    ["Very Low risk", "veryLow"],
    ["No risk", "veryLow"],
  ])("maps %s to %s", (level, bucket) => {
    expect(riskLevelBucket(level)).toBe(bucket);
  });

  it("returns null for unknown or empty levels", () => {
    expect(riskLevelBucket("")).toBeNull();
    expect(riskLevelBucket(undefined)).toBeNull();
    expect(riskLevelBucket("Whatever")).toBeNull();
  });
});

describe("riskLevelRank", () => {
  it("orders levels from lowest to highest", () => {
    const ranks = [
      "No risk",
      "Very low risk",
      "Low risk",
      "Medium risk",
      "High risk",
      "Very high risk",
    ].map(riskLevelRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(6);
  });

  it("is case-insensitive and ranks unknown levels below everything", () => {
    expect(riskLevelRank("Very Low risk")).toBe(riskLevelRank("Very low risk"));
    expect(riskLevelRank("")).toBeLessThan(riskLevelRank("No risk"));
    expect(riskLevelRank(null)).toBeLessThan(riskLevelRank("No risk"));
  });
});
