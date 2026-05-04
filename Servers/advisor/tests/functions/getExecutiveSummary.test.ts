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

describe("Advisor Functions: getExecutiveSummary", () => {
  const mockTenant = createMockTenant();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getExecutiveSummary = availableTools["get_executive_summary"];

  describe("Critical and High Risk Counts", () => {
    it("should count critical risks by Catastrophic severity", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Count risks with Catastrophic severity or Very high risk level
      const expectedCritical = mockRisks.filter(
        (r) => r.severity === "Catastrophic" || r.risk_level_autocalculated === "Very high risk",
      ).length;

      expect(result.criticalRisks).toBe(expectedCritical);
      expect(result.criticalRisks).toBeGreaterThan(0);
    });

    it("should count critical risks by Very high risk level", async () => {
      const testRisks = [
        createMockRisk({ risk_level_autocalculated: "Very high risk", severity: "Major" }),
        createMockRisk({ risk_level_autocalculated: "High risk", severity: "Major" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.criticalRisks).toBe(1);
    });

    it("should count high risks by Major severity", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Count risks with Major severity or High risk level
      const expectedHigh = mockRisks.filter(
        (r) => r.severity === "Major" || r.risk_level_autocalculated === "High risk",
      ).length;

      expect(result.highRisks).toBe(expectedHigh);
      expect(result.highRisks).toBeGreaterThan(0);
    });

    it("should not double-count risks in both critical and high", async () => {
      const testRisks = [
        createMockRisk({ severity: "Catastrophic", risk_level_autocalculated: "Very high risk" }),
        createMockRisk({ severity: "Major", risk_level_autocalculated: "High risk" }),
        createMockRisk({ severity: "Moderate", risk_level_autocalculated: "Medium risk" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.criticalRisks).toBe(1);
      expect(result.highRisks).toBe(1);
      expect(result.totalActiveRisks).toBe(3);
    });
  });

  describe("Top 3 Categories", () => {
    it("should return top 3 categories by frequency", async () => {
      const testRisks = [
        createMockRisk({ risk_category: ["Security"] }),
        createMockRisk({ risk_category: ["Security"] }),
        createMockRisk({ risk_category: ["Security"] }),
        createMockRisk({ risk_category: ["Privacy"] }),
        createMockRisk({ risk_category: ["Privacy"] }),
        createMockRisk({ risk_category: ["Performance"] }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.topCategories).toHaveLength(3);
      expect(result.topCategories[0]).toBe("Security");
      expect(result.topCategories[1]).toBe("Privacy");
      expect(result.topCategories[2]).toBe("Performance");
    });

    it("should handle risks with multiple categories", async () => {
      const testRisks = [
        createMockRisk({ risk_category: ["Security", "Privacy"] }),
        createMockRisk({ risk_category: ["Privacy", "Compliance"] }),
        createMockRisk({ risk_category: ["Security"] }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.topCategories.length).toBeLessThanOrEqual(3);
      // Security and Privacy should both be counted multiple times
      expect(result.topCategories).toContain("Security");
      expect(result.topCategories).toContain("Privacy");
    });

    it("should handle empty categories gracefully", async () => {
      const testRisks = [
        { ...createMockRisk({}), risk_category: [] },
        createMockRisk({ risk_category: ["Security"] }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.topCategories).toHaveLength(1);
      expect(result.topCategories[0]).toBe("Security");
    });
  });

  describe("Overdue Mitigations Calculation", () => {
    it("should count overdue risks with deadlines in the past", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      const testRisks = [
        createMockRisk({ deadline: pastDate, mitigation_status: "In Progress" }),
        createMockRisk({ deadline: pastDate, mitigation_status: "Not Started" }),
        createMockRisk({ deadline: futureDate, mitigation_status: "In Progress" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.overdueMitigations).toBe(2);
    });

    it("should not count completed risks as overdue", async () => {
      const pastDate = new Date("2024-01-01");
      const testRisks = [
        createMockRisk({ deadline: pastDate, mitigation_status: "Completed" }),
        createMockRisk({ deadline: pastDate, mitigation_status: "In Progress" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.overdueMitigations).toBe(1);
    });

    it("should handle risks without deadlines", async () => {
      const testRisks = [
        { ...createMockRisk({}), deadline: null, mitigation_status: "In Progress" } as any,
        createMockRisk({ deadline: new Date("2024-01-01"), mitigation_status: "In Progress" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Only the one with actual past deadline should count
      expect(result.overdueMitigations).toBe(1);
    });

    it("should count zero overdue when all deadlines are in the future", async () => {
      // Use a date 1 year in the future to ensure it's never overdue
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const testRisks = [
        createMockRisk({ deadline: futureDate, mitigation_status: "Not Started" }),
        createMockRisk({ deadline: futureDate, mitigation_status: "In Progress" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.overdueMitigations).toBe(0);
    });
  });

  describe("Mitigation Progress Breakdown", () => {
    it("should correctly count Not Started, In Progress, and completed risks", async () => {
      const testRisks = [
        createMockRisk({ mitigation_status: "Not Started" }),
        createMockRisk({ mitigation_status: "Not Started" }),
        createMockRisk({ mitigation_status: "In Progress" }),
        createMockRisk({ mitigation_status: "Completed" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.mitigationProgress.notStarted).toBe(2);
      expect(result.mitigationProgress.inProgress).toBe(1);
      expect(result.mitigationProgress.completed).toBe(1);
    });

    it("should not count other statuses in progress breakdown", async () => {
      const testRisks = [
        createMockRisk({ mitigation_status: "Not Started" }),
        createMockRisk({ mitigation_status: "On Hold" }),
        createMockRisk({ mitigation_status: "Deferred" }),
        createMockRisk({ mitigation_status: "Canceled" }),
        createMockRisk({ mitigation_status: "Requires review" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Only "Not Started", "In Progress", and "Completed" should be counted
      expect(result.mitigationProgress.notStarted).toBe(1);
      expect(result.mitigationProgress.inProgress).toBe(0);
      expect(result.mitigationProgress.completed).toBe(0);
    });
  });

  describe("Urgent Risks Sorted by Deadline", () => {
    it("should return top 5 urgent risks with Major/Catastrophic severity", async () => {
      const testRisks = [
        createMockRisk({ severity: "Major", mitigation_status: "In Progress" }),
        createMockRisk({ severity: "Catastrophic", mitigation_status: "Not Started" }),
        createMockRisk({ severity: "Major", mitigation_status: "In Progress" }),
        createMockRisk({ severity: "Catastrophic", mitigation_status: "In Progress" }),
        createMockRisk({ severity: "Major", mitigation_status: "Not Started" }),
        createMockRisk({ severity: "Major", mitigation_status: "In Progress" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.urgentRisks.length).toBeLessThanOrEqual(5);
      expect(
        result.urgentRisks.every(
          (r: any) => r.severity === "Major" || r.severity === "Catastrophic",
        ),
      ).toBe(true);
    });

    it("should sort urgent risks by deadline (overdue first)", async () => {
      const now = new Date();
      const veryOverdue = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const slightlyOverdue = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const upcoming = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const testRisks = [
        createMockRisk({
          id: 1,
          severity: "Major",
          deadline: upcoming,
          mitigation_status: "Not Started",
        }),
        createMockRisk({
          id: 2,
          severity: "Catastrophic",
          deadline: veryOverdue,
          mitigation_status: "In Progress",
        }),
        createMockRisk({
          id: 3,
          severity: "Major",
          deadline: slightlyOverdue,
          mitigation_status: "Not Started",
        }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Most overdue should be first
      expect(result.urgentRisks[0].id).toBe(2); // veryOverdue
      expect(result.urgentRisks[1].id).toBe(3); // slightlyOverdue
      expect(result.urgentRisks[2].id).toBe(1); // upcoming
    });

    it("should calculate daysUntilDeadline correctly", async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
      const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      const testRisks = [
        createMockRisk({
          severity: "Major",
          deadline: futureDate,
          mitigation_status: "In Progress",
        }),
        createMockRisk({
          severity: "Catastrophic",
          deadline: pastDate,
          mitigation_status: "Not Started",
        }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Check that daysUntilDeadline is calculated
      expect(result.urgentRisks[0].daysUntilDeadline).toBe(-5); // Overdue (negative)
      expect(result.urgentRisks[1].daysUntilDeadline).toBe(10); // Future (positive)
    });

    it("should not include completed risks in urgent risks", async () => {
      const testRisks = [
        createMockRisk({ severity: "Major", mitigation_status: "Completed" }),
        createMockRisk({ severity: "Catastrophic", mitigation_status: "Completed" }),
        createMockRisk({ severity: "Major", mitigation_status: "In Progress" }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.urgentRisks).toHaveLength(1);
      expect(result.urgentRisks[0].severity).toBe("Major");
    });

    it("should include risk details in urgent risks", async () => {
      const testRisks = [
        createMockRisk({
          id: 123,
          risk_name: "Critical Security Issue",
          severity: "Catastrophic",
          likelihood: "Likely",
          mitigation_status: "In Progress",
        }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.urgentRisks[0]).toMatchObject({
        id: 123,
        name: "Critical Security Issue",
        severity: "Catastrophic",
        likelihood: "Likely",
      });
      expect(result.urgentRisks[0].deadline).toBeDefined();
      expect(result.urgentRisks[0].daysUntilDeadline).toBeDefined();
    });

    it("should place risks without deadlines last when sorting", async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const testRisks = [
        {
          ...createMockRisk({ id: 1, severity: "Major", mitigation_status: "Not Started" }),
          deadline: null,
        } as any,
        createMockRisk({
          id: 2,
          severity: "Catastrophic",
          deadline: futureDate,
          mitigation_status: "In Progress",
        }),
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      // Risk with deadline should come first
      expect(result.urgentRisks[0].id).toBe(2);
      expect(result.urgentRisks[1].id).toBe(1);
      expect(result.urgentRisks[1].daysUntilDeadline).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty dataset gracefully", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockEmptyRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.totalActiveRisks).toBe(0);
      expect(result.criticalRisks).toBe(0);
      expect(result.highRisks).toBe(0);
      expect(result.topCategories).toHaveLength(0);
      expect(result.overdueMitigations).toBe(0);
      expect(result.mitigationProgress.notStarted).toBe(0);
      expect(result.mitigationProgress.inProgress).toBe(0);
      expect(result.mitigationProgress.completed).toBe(0);
      expect(result.urgentRisks).toHaveLength(0);
    });

    it("should handle all risks without deadlines", async () => {
      const testRisks = [
        {
          ...createMockRisk({ severity: "Major", mitigation_status: "In Progress" }),
          deadline: null,
        } as any,
        {
          ...createMockRisk({ severity: "Catastrophic", mitigation_status: "Not Started" }),
          deadline: null,
        } as any,
      ];
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(testRisks);

      const result = await getExecutiveSummary({}, mockTenant);

      expect(result.overdueMitigations).toBe(0);
      expect(result.urgentRisks.every((r: any) => r.daysUntilDeadline === null)).toBe(true);
    });
  });
});
