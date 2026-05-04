import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as riskUtils from "../../../utils/risk.utils";
import { availableRiskTools } from "../../functions/riskFunctions";
import { availableModelInventoryTools } from "../../functions/modelInventoryFunctions";
import {
  mockRisks,
  mockEmptyRisks,
  mockProjectRisks,
  mockFrameworkRisks,
} from "../../mocks/mockRiskData";
import { createMockTenant } from "../../mocks/mockTenant";
import { IRisk } from "../../../domain.layer/interfaces/I.risk";

const availableTools = {
  ...availableRiskTools,
  ...availableModelInventoryTools,
};

/** Helper: project a full IRisk to the lightweight shape returned by fetchRisks */
const toProjection = (r: IRisk) => ({
  id: r.id,
  risk_name: r.risk_name,
  risk_level: r.risk_level_autocalculated,
  severity: r.severity,
  likelihood: r.likelihood,
  risk_category: r.risk_category,
  mitigation_status: r.mitigation_status,
  ai_lifecycle_phase: r.ai_lifecycle_phase,
  deadline: r.deadline,
  risk_owner: r.risk_owner,
  current_risk_level: r.current_risk_level,
});

// Mock the utility modules
jest.mock("../../../utils/risk.utils");

describe("Advisor Functions: fetchRisks", () => {
  const mockTenant = createMockTenant();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const fetchRisks = availableTools["fetch_risks"];

  describe("Basic Fetching", () => {
    it("should fetch all risks when no filters provided", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);

      const result = await fetchRisks({}, mockTenant);

      expect(riskUtils.getAllRisksQuery).toHaveBeenCalledWith(mockTenant, "active");
      expect(result).toEqual(mockRisks.map(toProjection));
      expect(result).toHaveLength(mockRisks.length);
    });

    it("should fetch risks by projectId", async () => {
      jest.spyOn(riskUtils, "getRisksByProjectQuery").mockResolvedValue(mockProjectRisks);

      const result = await fetchRisks({ projectId: 1 }, mockTenant);

      expect(riskUtils.getRisksByProjectQuery).toHaveBeenCalledWith(1, mockTenant, "active");
      expect(result).toEqual(mockProjectRisks.map(toProjection));
    });

    it("should fetch risks by frameworkId", async () => {
      jest.spyOn(riskUtils, "getRisksByFrameworkQuery").mockResolvedValue(mockFrameworkRisks);

      const result = await fetchRisks({ frameworkId: 1 }, mockTenant);

      expect(riskUtils.getRisksByFrameworkQuery).toHaveBeenCalledWith(1, mockTenant, "active");
      expect(result).toEqual(mockFrameworkRisks.map(toProjection));
    });

    it("should return empty array when no risks found", async () => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockEmptyRisks);

      const result = await fetchRisks({}, mockTenant);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("Filter Validation", () => {
    beforeEach(() => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);
    });

    it("should filter by severity correctly", async () => {
      const result = await fetchRisks({ severity: "Catastrophic" }, mockTenant);

      expect(result.every((r: any) => r.severity === "Catastrophic")).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by likelihood correctly", async () => {
      const result = await fetchRisks({ likelihood: "Likely" }, mockTenant);

      expect(result.every((r: any) => r.likelihood === "Likely")).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by category (case-insensitive)", async () => {
      const result = await fetchRisks({ category: "privacy" }, mockTenant);

      expect(
        result.every((r: any) =>
          r.risk_category.some((cat: any) => cat.toLowerCase().includes("privacy")),
        ),
      ).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by mitigation status", async () => {
      const result = await fetchRisks({ mitigationStatus: "In Progress" }, mockTenant);

      expect(result.every((r: any) => r.mitigation_status === "In Progress")).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by risk level", async () => {
      const result = await fetchRisks({ riskLevel: "High risk" }, mockTenant);

      expect(result.every((r: any) => r.risk_level === "High risk")).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by AI lifecycle phase", async () => {
      const result = await fetchRisks(
        { aiLifecyclePhase: "Model development & training" },
        mockTenant,
      );

      expect(
        result.every((r: any) => r.ai_lifecycle_phase === "Model development & training"),
      ).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should apply multiple filters simultaneously", async () => {
      const result = await fetchRisks(
        {
          severity: "Catastrophic",
          mitigationStatus: "In Progress",
        },
        mockTenant,
      );

      expect(
        result.every(
          (r: any) => r.severity === "Catastrophic" && r.mitigation_status === "In Progress",
        ),
      ).toBe(true);
    });
  });

  describe("Limit Functionality", () => {
    beforeEach(() => {
      jest.spyOn(riskUtils, "getAllRisksQuery").mockResolvedValue(mockRisks);
    });

    it("should respect limit parameter", async () => {
      const result = await fetchRisks({ limit: 3 }, mockTenant);

      expect(result).toHaveLength(3);
    });

    it("should return all risks when limit not provided", async () => {
      const result = await fetchRisks({}, mockTenant);

      expect(result).toHaveLength(mockRisks.length);
    });

    it("should handle limit greater than result set", async () => {
      const result = await fetchRisks({ limit: 1000 }, mockTenant);

      expect(result).toHaveLength(mockRisks.length);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid projectId gracefully", async () => {
      jest.spyOn(riskUtils, "getRisksByProjectQuery").mockResolvedValue([]);

      const result = await fetchRisks({ projectId: 99999 }, mockTenant);

      expect(result).toEqual([]);
    });

    it("should handle invalid frameworkId gracefully", async () => {
      jest.spyOn(riskUtils, "getRisksByFrameworkQuery").mockResolvedValue([]);

      const result = await fetchRisks({ frameworkId: 99999 }, mockTenant);

      expect(result).toEqual([]);
    });
  });
});
