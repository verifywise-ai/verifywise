import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as riskUtils from "../../../utils/risk.utils";
import { availableRiskTools } from "../../functions/riskFunctions";
import { availableModelInventoryTools } from "../../functions/modelInventoryFunctions";
import { mockRisks, mockEmptyRisks, createMockRisk } from "../../mocks/mockRiskData";
import { createMockTenant } from "../../mocks/mockTenant";

const availableTools = {
  ...availableRiskTools,
  ...availableModelInventoryTools,
};

// Mock the utility modules
jest.mock("../../../utils/risk.utils");

describe("Advisor Functions: getRiskAnalytics", () => {
  const mockTenant = createMockTenant();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getRiskAnalytics = availableTools["get_risk_analytics"];

  describe("Risk Matrix Generation", () => {
    it("should create 5x5 matrix with all severity-likelihood combinations", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      // Check structure
      expect(result).toHaveProperty("riskMatrix");
      expect(result).toHaveProperty("categoryDistribution");
      expect(result).toHaveProperty("mitigationStatusBreakdown");
      expect(result).toHaveProperty("lifecyclePhaseDistribution");
      expect(result).toHaveProperty("riskLevelSummary");
      expect(result).toHaveProperty("totalRisks");

      // Check risk matrix is 5x5
      expect(Object.keys(result.riskMatrix)).toHaveLength(5);
      Object.values(result.riskMatrix).forEach((row: any) => {
        expect(Object.keys(row)).toHaveLength(5);
      });

      // Check categoryDistribution is array
      expect(Array.isArray(result.categoryDistribution)).toBe(true);

      // Check each category has required fields
      result.categoryDistribution.forEach((cat: any) => {
        expect(cat).toHaveProperty("category");
        expect(cat).toHaveProperty("count");
        expect(cat).toHaveProperty("percentage");
        expect(typeof cat.count).toBe("number");
        expect(typeof cat.percentage).toBe("number");
      });

      // Check totalRisks is a number
      expect(typeof result.totalRisks).toBe("number");

      const severities = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
      const likelihoods = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];

      severities.forEach((sev) => {
        expect(result.riskMatrix[sev]).toBeDefined();
        likelihoods.forEach((like) => {
          expect(result.riskMatrix[sev][like]).toBeDefined();
          expect(typeof result.riskMatrix[sev][like]).toBe("number");
        });
      });
    });

    it("should count risks correctly in each matrix cell", async () => {
      const testRisks = [
        createMockRisk({ severity: "Major", likelihood: "Likely" }),
        createMockRisk({ severity: "Major", likelihood: "Likely" }),
        createMockRisk({ severity: "Moderate", likelihood: "Possible" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.riskMatrix["Major"]["Likely"]).toBe(2);
      expect(result.riskMatrix["Moderate"]["Possible"]).toBe(1);
    });

    it("should initialize all cells to zero when no risks exist", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockEmptyRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      Object.values(result.riskMatrix).forEach((row: any) => {
        Object.values(row).forEach((count) => {
          expect(count).toBe(0);
        });
      });
    });

    it("should handle missing severity or likelihood data", async () => {
      const testRisks = [
        createMockRisk({ severity: "Major", likelihood: "Likely" }),
        { ...createMockRisk({ severity: undefined, likelihood: "Possible" }) } as any,
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      // Should only count the valid risk
      expect(result.riskMatrix["Major"]["Likely"]).toBe(1);
    });
  });

  describe("Category Distribution", () => {
    it("should calculate correct counts for each category", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.categoryDistribution).toBeInstanceOf(Array);
      result.categoryDistribution.forEach((cat: any) => {
        expect(cat.count).toBeGreaterThan(0);
      });
    });

    it("should calculate correct percentages", async () => {
      const testRisks = [
        createMockRisk({ risk_category: ["Security"] }),
        createMockRisk({ risk_category: ["Security"] }),
        createMockRisk({ risk_category: ["Privacy"] }),
        createMockRisk({ risk_category: ["Privacy"] }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      // Security Percentage check
      const securityCat = result.categoryDistribution.find((c: any) => c.category === "Security");
      expect(securityCat?.percentage).toBe(50);

      // Privacy Percentage check
      const privacyCat = result.categoryDistribution.find((c: any) => c.category === "Privacy");
      expect(privacyCat?.percentage).toBe(50);
    });

    it("should handle multi-category risks (array of categories)", async () => {
      const testRisks = [createMockRisk({ risk_category: ["Security", "Privacy"] })];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.categoryDistribution.some((c: any) => c.category === "Security")).toBe(true);
      expect(result.categoryDistribution.some((c: any) => c.category === "Privacy")).toBe(true);
    });

    it("should sort categories by count descending", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      for (let i = 0; i < result.categoryDistribution.length - 1; i++) {
        expect(result.categoryDistribution[i].count).toBeGreaterThanOrEqual(
          result.categoryDistribution[i + 1].count,
        );
      }
    });

    it("should handle empty category arrays", async () => {
      const testRisks = [{ ...createMockRisk({}), risk_category: [] }];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.categoryDistribution).toHaveLength(0);
    });
  });

  describe("Mitigation Status Breakdown", () => {
    it("should count all mitigation statuses", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.mitigationStatusBreakdown).toBeDefined();
      expect(typeof result.mitigationStatusBreakdown).toBe("object");
    });

    it("should default to 'Not Started' for missing status", async () => {
      const testRisks = [{ ...createMockRisk({}), mitigation_status: undefined } as any];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.mitigationStatusBreakdown["Not Started"]).toBe(1);
    });
  });

  describe("Lifecycle Phase Distribution", () => {
    it("should count risks by lifecycle phase", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.lifecyclePhaseDistribution).toBeDefined();
      expect(typeof result.lifecyclePhaseDistribution).toBe("object");
    });
  });

  describe("Risk Level Summary", () => {
    it("should count risks by auto-calculated level", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.riskLevelSummary).toBeDefined();
      expect(typeof result.riskLevelSummary).toBe("object");
    });

    it("should handle missing risk level data", async () => {
      const testRisks = [
        createMockRisk({ risk_level_autocalculated: "High risk" }),
        { ...createMockRisk({}), risk_level_autocalculated: undefined } as any,
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.riskLevelSummary["High risk"]).toBe(1);
    });

    it("should calculate total risks correctly", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getRiskAnalytics({}, mockTenant);

      expect(result.totalRisks).toBe(mockRisks.length);
    });
  });
});
