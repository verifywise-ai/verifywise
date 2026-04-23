import { describe, it, expect } from "vitest";
import {
  statusColorSchemes,
  getStatusColor,
  createStatusData,
  getDefaultStatusDistribution,
} from "../statusColors";

describe("statusColorSchemes", () => {
  it("has all expected entity types", () => {
    expect(statusColorSchemes).toHaveProperty("models");
    expect(statusColorSchemes).toHaveProperty("vendors");
    expect(statusColorSchemes).toHaveProperty("policies");
    expect(statusColorSchemes).toHaveProperty("trainings");
    expect(statusColorSchemes).toHaveProperty("vendorRisks");
    expect(statusColorSchemes).toHaveProperty("incidents");
  });
});

describe("getStatusColor", () => {
  it("returns correct color for known model status", () => {
    const color = getStatusColor("models", "production");
    expect(color).toBe(statusColorSchemes.models.production);
  });

  it("returns correct color for vendor status with spaces", () => {
    const color = getStatusColor("vendors", "in review");
    expect(color).toBe(statusColorSchemes.vendors["in review"]);
  });

  it("normalizes status to lowercase", () => {
    const color = getStatusColor("models", "Production");
    expect(color).toBe(statusColorSchemes.models.production);
  });

  it("returns default color for unknown status", () => {
    const color = getStatusColor("models", "nonexistent");
    expect(typeof color).toBe("string");
  });
});

describe("createStatusData", () => {
  it("converts status counts to IStatusData array", () => {
    const result = createStatusData("models", {
      development: 3,
      production: 5,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      label: "development",
      value: 3,
      color: statusColorSchemes.models.development,
    });
    expect(result[1]).toEqual({
      label: "production",
      value: 5,
      color: statusColorSchemes.models.production,
    });
  });

  it("returns empty array for empty counts", () => {
    expect(createStatusData("models", {})).toEqual([]);
  });
});

describe("getDefaultStatusDistribution", () => {
  it("returns empty array for total=0", () => {
    expect(getDefaultStatusDistribution("models", 0)).toEqual([]);
  });

  it("returns 4 statuses for models", () => {
    const result = getDefaultStatusDistribution("models", 10);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.label)).toEqual([
      "Production",
      "Development",
      "Training",
      "Validation",
    ]);
  });

  it("values sum to total for models", () => {
    const result = getDefaultStatusDistribution("models", 10);
    const sum = result.reduce((acc, item) => acc + item.value, 0);
    expect(sum).toBe(10);
  });

  it("returns 3 statuses for trainings", () => {
    const result = getDefaultStatusDistribution("trainings", 20);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.label)).toEqual([
      "Completed",
      "In Progress",
      "Planned",
    ]);
  });

  it("returns 4 statuses for policies", () => {
    const result = getDefaultStatusDistribution("policies", 10);
    expect(result).toHaveLength(4);
  });

  it("returns 3 statuses for vendors", () => {
    const result = getDefaultStatusDistribution("vendors", 10);
    expect(result).toHaveLength(3);
  });

  it("returns 4 statuses for vendorRisks", () => {
    const result = getDefaultStatusDistribution("vendorRisks", 20);
    expect(result).toHaveLength(4);
  });

  it("returns 4 statuses for incidents", () => {
    const result = getDefaultStatusDistribution("incidents", 10);
    expect(result).toHaveLength(4);
  });

  it("each item has a color string", () => {
    const result = getDefaultStatusDistribution("models", 10);
    result.forEach((item) => {
      expect(typeof item.color).toBe("string");
      expect(item.color.length).toBeGreaterThan(0);
    });
  });
});
