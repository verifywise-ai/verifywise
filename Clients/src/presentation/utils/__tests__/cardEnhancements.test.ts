import { describe, it, expect } from "vitest";
import {
  getDistributionSummary,
  getQuickStats,
  hasCriticalItems,
  getPriorityLevel,
} from "../cardEnhancements";
import { IStatusData } from "../../types/interfaces/i.chart";

describe("getDistributionSummary", () => {
  it("filters values > 0, sorts descending, takes top 3", () => {
    const data: IStatusData[] = [
      { label: "Low", value: 10, color: "#000" },
      { label: "High", value: 30, color: "#000" },
      { label: "Medium", value: 20, color: "#000" },
      { label: "Very High", value: 5, color: "#000" },
      { label: "None", value: 0, color: "#000" },
    ];
    expect(getDistributionSummary(data)).toBe("30 High, 20 Medium, 10 Low");
  });

  it("returns empty string for empty array", () => {
    expect(getDistributionSummary([])).toBe("");
  });

  it("returns empty string for all-zero values", () => {
    const data: IStatusData[] = [
      { label: "A", value: 0, color: "#000" },
      { label: "B", value: 0, color: "#000" },
    ];
    expect(getDistributionSummary(data)).toBe("");
  });

  it("handles single non-zero item", () => {
    const data: IStatusData[] = [
      { label: "Active", value: 5, color: "#000" },
    ];
    expect(getDistributionSummary(data)).toBe("5 Active");
  });
});

describe("getQuickStats", () => {
  it("returns models in production count", () => {
    const data: IStatusData[] = [
      { label: "Production", value: 4, color: "#000" },
      { label: "Development", value: 6, color: "#000" },
    ];
    expect(getQuickStats("models", 10, data)).toBe("4 in production");
  });

  it("returns completion rate for trainings", () => {
    const data: IStatusData[] = [
      { label: "Completed", value: 7, color: "#000" },
      { label: "In Progress", value: 3, color: "#000" },
    ];
    expect(getQuickStats("trainings", 10, data)).toBe("70% completion rate");
  });

  it("returns published count for policies", () => {
    const data: IStatusData[] = [
      { label: "Published", value: 3, color: "#000" },
    ];
    expect(getQuickStats("policies", 5, data)).toBe("3 published");
  });

  it("returns active count for vendors", () => {
    const data: IStatusData[] = [
      { label: "Active", value: 8, color: "#000" },
    ];
    expect(getQuickStats("vendors", 10, data)).toBe("8 active");
  });

  it("returns require attention for vendorRisks with high risks", () => {
    const data: IStatusData[] = [
      { label: "High", value: 3, color: "#000" },
      { label: "Very High", value: 1, color: "#000" },
    ];
    expect(getQuickStats("vendorRisks", 10, data)).toBe("4 require attention");
  });

  it("falls back to percentage-based count when no high/very high found", () => {
    // When no "high"/"very high" labels exist, uses Math.floor(total * 0.2) + Math.floor(total * 0.05)
    const data: IStatusData[] = [
      { label: "Low", value: 5, color: "#000" },
      { label: "Medium", value: 3, color: "#000" },
    ];
    expect(getQuickStats("vendorRisks", 8, data)).toBe("1 require attention");
  });

  it("returns open count for incidents", () => {
    const data: IStatusData[] = [
      { label: "Open", value: 2, color: "#000" },
    ];
    expect(getQuickStats("incidents", 5, data)).toBe("2 open");
  });

  it("falls back to percentage-based open count when no 'Open' label found", () => {
    // When no "open" label exists, uses Math.floor(total * 0.3)
    const data: IStatusData[] = [
      { label: "Resolved", value: 3, color: "#000" },
      { label: "Closed", value: 2, color: "#000" },
    ];
    expect(getQuickStats("incidents", 5, data)).toBe("1 open");
  });

  it("returns empty string for total=0", () => {
    expect(getQuickStats("models", 0)).toBe("");
  });

  it("returns empty string for undefined entityType", () => {
    expect(getQuickStats(undefined, 10)).toBe("");
  });
});

describe("hasCriticalItems", () => {
  it("returns critical for vendorRisks with high risk", () => {
    const data: IStatusData[] = [
      { label: "High", value: 3, color: "#000" },
    ];
    const result = hasCriticalItems("vendorRisks", data);
    expect(result.hasCritical).toBe(true);
    expect(result.actionRoute).toBe("/vendors?filter=high-risk");
  });

  it("returns not critical for vendorRisks with no high risks", () => {
    const data: IStatusData[] = [
      { label: "Low", value: 5, color: "#000" },
    ];
    const result = hasCriticalItems("vendorRisks", data);
    expect(result.hasCritical).toBe(false);
  });

  it("returns critical for policies with drafts", () => {
    const data: IStatusData[] = [
      { label: "Draft", value: 2, color: "#000" },
      { label: "In Review", value: 1, color: "#000" },
    ];
    const result = hasCriticalItems("policies", data);
    expect(result.hasCritical).toBe(true);
    expect(result.actionRoute).toBe("/policies?filter=needs-review");
  });

  it("returns critical for incidents with open items", () => {
    const data: IStatusData[] = [
      { label: "Open", value: 4, color: "#000" },
    ];
    const result = hasCriticalItems("incidents", data);
    expect(result.hasCritical).toBe(true);
    expect(result.actionRoute).toBe("/ai-incident-managements?filter=open");
  });

  it("returns not critical when entityType is undefined", () => {
    const result = hasCriticalItems(undefined);
    expect(result.hasCritical).toBe(false);
  });
});

describe("getPriorityLevel", () => {
  it("returns 'high' for vendorRisks with very high risks", () => {
    const data: IStatusData[] = [
      { label: "Very High", value: 2, color: "#000" },
    ];
    expect(getPriorityLevel("vendorRisks", 10, data)).toBe("high");
  });

  it("returns 'medium' for vendorRisks with high (not very high) risks", () => {
    const data: IStatusData[] = [
      { label: "High", value: 3, color: "#000" },
      { label: "Low", value: 7, color: "#000" },
    ];
    expect(getPriorityLevel("vendorRisks", 10, data)).toBe("medium");
  });

  it("returns 'none' for vendorRisks with no high risks", () => {
    const data: IStatusData[] = [
      { label: "Low", value: 10, color: "#000" },
    ];
    expect(getPriorityLevel("vendorRisks", 10, data)).toBe("none");
  });

  it("returns 'high' for policies with >30% drafts", () => {
    const data: IStatusData[] = [
      { label: "Draft", value: 4, color: "#000" },
    ];
    expect(getPriorityLevel("policies", 10, data)).toBe("high");
  });

  it("returns 'high' for trainings with <50% completion", () => {
    const data: IStatusData[] = [
      { label: "Completed", value: 2, color: "#000" },
    ];
    expect(getPriorityLevel("trainings", 10, data)).toBe("high");
  });

  it("returns 'medium' for trainings with 50-75% completion", () => {
    const data: IStatusData[] = [
      { label: "Completed", value: 6, color: "#000" },
    ];
    expect(getPriorityLevel("trainings", 10, data)).toBe("medium");
  });

  it("returns 'none' for total=0", () => {
    expect(getPriorityLevel("models", 0)).toBe("none");
  });

  it("returns 'none' for undefined entityType", () => {
    expect(getPriorityLevel(undefined, 10)).toBe("none");
  });
});
