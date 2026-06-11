import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as complianceUtils from "../../../utils/compliance.utils";
import { availableComplianceTools } from "../../functions/complianceFunctions";
import { createMockTenant } from "../../mocks/mockTenant";

jest.mock("../../../utils/compliance.utils");

const mockComplianceScore = {
  overallScore: 87,
  calculatedAt: "2026-05-01T00:00:00Z",
  modules: {
    riskManagement: { score: 92, weight: 0.25, totalDataPoints: 45 },
    vendorManagement: { score: 78, weight: 0.2, totalDataPoints: 30 },
    projectGovernance: { score: 85, weight: 0.2, totalDataPoints: 25 },
    modelLifecycle: { score: 90, weight: 0.2, totalDataPoints: 20 },
    policyDocumentation: { score: 88, weight: 0.15, totalDataPoints: 35 },
  },
  metadata: { framework: "ISO-42001", version: "1.2" },
};

describe("Advisor Functions: getComplianceScore", () => {
  const mockTenant = createMockTenant();
  const getComplianceScore = availableComplianceTools["get_compliance_score"];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return compliance score with all modules", async () => {
    jest
      .spyOn(complianceUtils, "calculateComplianceScore")
      .mockResolvedValue(mockComplianceScore as any);

    const result = await getComplianceScore({}, mockTenant);

    expect(complianceUtils.calculateComplianceScore).toHaveBeenCalledWith(mockTenant);
    expect(result.overall_score).toBe(87);
    expect(result.modules).toHaveProperty("risk_management");
    expect(result.modules).toHaveProperty("vendor_management");
    expect(result.modules).toHaveProperty("project_governance");
    expect(result.modules).toHaveProperty("model_lifecycle");
    expect(result.modules).toHaveProperty("policy_documentation");
  });

  it("should include score, weight, and data_points for each module", async () => {
    jest
      .spyOn(complianceUtils, "calculateComplianceScore")
      .mockResolvedValue(mockComplianceScore as any);

    const result = await getComplianceScore({}, mockTenant);

    expect(result.modules.risk_management).toEqual({
      score: 92,
      weight: 0.25,
      data_points: 45,
    });
    expect(result.modules.vendor_management).toEqual({
      score: 78,
      weight: 0.2,
      data_points: 30,
    });
  });

  it("should include metadata in response", async () => {
    jest
      .spyOn(complianceUtils, "calculateComplianceScore")
      .mockResolvedValue(mockComplianceScore as any);

    const result = await getComplianceScore({}, mockTenant);

    expect(result.metadata).toEqual({ framework: "ISO-42001", version: "1.2" });
  });

  it("should include calculated_at timestamp", async () => {
    jest
      .spyOn(complianceUtils, "calculateComplianceScore")
      .mockResolvedValue(mockComplianceScore as any);

    const result = await getComplianceScore({}, mockTenant);

    expect(result.calculated_at).toBe("2026-05-01T00:00:00Z");
  });

  it("should throw when calculateComplianceScore fails", async () => {
    jest
      .spyOn(complianceUtils, "calculateComplianceScore")
      .mockRejectedValue(new Error("DB error"));

    await expect(getComplianceScore({}, mockTenant)).rejects.toThrow(
      "Failed to get compliance score",
    );
  });
});
