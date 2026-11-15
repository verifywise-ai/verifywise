import { chartTheme } from "../../../themes/chartTheme";
import { riskLevelBucketLabel, riskLevelColor } from "../riskLevelColor";

describe("riskLevelColor", () => {
  it("uses the summary card colour for each level", () => {
    expect(riskLevelColor("Very high risk")).toBe(chartTheme.riskSummary.veryHigh);
    expect(riskLevelColor("High risk")).toBe(chartTheme.riskSummary.high);
    expect(riskLevelColor("Medium risk")).toBe(chartTheme.riskSummary.medium);
    expect(riskLevelColor("Low risk")).toBe(chartTheme.riskSummary.low);
    expect(riskLevelColor("Very low risk")).toBe(chartTheme.riskSummary.veryLow);
    expect(riskLevelColor("No risk")).toBe(chartTheme.riskSummary.veryLow);
  });

  it("gives a Very high risk chip a different colour from a Low one", () => {
    expect(riskLevelColor("Very high risk")).not.toBe(riskLevelColor("Low risk"));
  });

  it("falls back to the very low colour for an empty level", () => {
    expect(riskLevelColor("")).toBe(chartTheme.riskSummary.veryLow);
    expect(riskLevelColor(null)).toBe(chartTheme.riskSummary.veryLow);
  });

  it("names the card bucket in sentence case", () => {
    expect(riskLevelBucketLabel("Very high risk")).toBe("Very high");
    expect(riskLevelBucketLabel("Medium risk")).toBe("Medium");
  });
});
