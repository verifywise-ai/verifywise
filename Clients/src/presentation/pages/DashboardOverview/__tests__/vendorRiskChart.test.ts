import { describe, it, expect } from "vitest";
import { getVendorRiskData } from "../constants";
import { buildVendorRiskDashboardMetrics } from "../../../../application/utils/vendorRiskRows";
import { VENDOR_RISK_LEVEL_LABELS } from "../../../../application/utils/riskLevel";

describe("dashboard vendor risk chart", () => {
  it("uses the vendor risk level names, in sentence case", () => {
    const labels = getVendorRiskData({ veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 }).map(
      (slice) => slice.label,
    );
    expect(labels).toEqual([...VENDOR_RISK_LEVEL_LABELS].reverse());
    expect(labels).toEqual(["Very high", "High", "Medium", "Low", "No risk"]);
  });

  // The "No risk" slice reads the bucket the dashboard metrics count "No risk" in.
  it("counts No risk risks in the No risk slice", () => {
    const { distribution } = buildVendorRiskDashboardMetrics([
      { id: 1, risk_level: "No risk" },
      { id: 2, risk_level: "Very high risk" },
    ] as any);
    const slices = Object.fromEntries(
      getVendorRiskData(distribution).map((slice) => [slice.label, slice.value]),
    );
    expect(slices["No risk"]).toBe(1);
    expect(slices["Very high"]).toBe(1);
  });

  it("adds a Not assessed slice so the slices add up to the total", () => {
    const { distribution, total } = buildVendorRiskDashboardMetrics([
      { id: 1, risk_level: "High risk" },
      { id: 2, risk_level: null },
    ] as any);
    const slices = getVendorRiskData(distribution);
    expect(slices[slices.length - 1]).toMatchObject({ label: "Not assessed", value: 1 });
    expect(slices.reduce((sum, slice) => sum + slice.value, 0)).toBe(total);
  });
});
