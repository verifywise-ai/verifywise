import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/compliance.utils", () => ({
  calculateComplianceScore: jest.fn(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

import {
  getComplianceScore,
  getComplianceScoreByOrganization,
  getComplianceDetails,
} from "../compliance.ctrl";
import { calculateComplianceScore } from "../../utils/compliance.utils";

const mockCalc = calculateComplianceScore as jest.MockedFunction<typeof calculateComplianceScore>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("compliance.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getComplianceScore", () => {
    it("should return 200 with compliance score", async () => {
      const req = createReq();
      const res = createRes();
      const complianceData = {
        score: 85,
        modules: {
          riskManagement: { score: 90, weight: 0.2, qualityScore: 95 },
          vendorManagement: { score: 80, weight: 0.2, qualityScore: 85 },
          projectGovernance: { score: 85, weight: 0.2, qualityScore: 90 },
          modelLifecycle: { score: 88, weight: 0.2, qualityScore: 92 },
          policyDocumentation: { score: 82, weight: 0.2, qualityScore: 88 },
        },
      };
      mockCalc.mockResolvedValue(complianceData);

      await getComplianceScore(req, res);

      expect(mockCalc).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: complianceData,
      });
    });

    it("should return 400 when organizationId is missing", async () => {
      const req = createReq({ organizationId: undefined });
      const res = createRes();

      await getComplianceScore(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Organization ID is required",
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq();
      const res = createRes();
      const error = new Error("Database connection failed");
      mockCalc.mockRejectedValue(error);

      await getComplianceScore(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: error.message,
      });
    });
  });

  describe("getComplianceScoreByOrganization", () => {
    it("should return 200 with score for valid org", async () => {
      const req = createReq({
        organizationId: 2,
        params: { organizationId: "2" },
      });
      const res = createRes();
      const complianceData = {
        score: 85,
        modules: {
          riskManagement: { score: 90, weight: 0.2, qualityScore: 95 },
          vendorManagement: { score: 80, weight: 0.2, qualityScore: 85 },
          projectGovernance: { score: 85, weight: 0.2, qualityScore: 90 },
          modelLifecycle: { score: 88, weight: 0.2, qualityScore: 92 },
          policyDocumentation: { score: 82, weight: 0.2, qualityScore: 88 },
        },
      };
      mockCalc.mockResolvedValue(complianceData);

      await getComplianceScoreByOrganization(req, res);

      expect(mockCalc).toHaveBeenCalledWith(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: complianceData,
      });
    });

    it("should return 400 for invalid organization ID", async () => {
      const req = createReq({
        params: { organizationId: "abc" },
      });
      const res = createRes();

      await getComplianceScoreByOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid organization ID",
      });
    });

    it("should return 403 for unauthorized organization", async () => {
      const req = createReq({
        organizationId: 1,
        params: { organizationId: "99" },
      });
      const res = createRes();

      await getComplianceScoreByOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Access denied: User does not have permission to access this organization's compliance data",
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq({
        organizationId: 2,
        params: { organizationId: "2" },
      });
      const res = createRes();
      const error = new Error("Database connection failed");
      mockCalc.mockRejectedValue(error);

      await getComplianceScoreByOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: error.message,
      });
    });
  });

  describe("getComplianceDetails", () => {
    it("should return 200 with detailed compliance", async () => {
      const req = createReq({
        organizationId: 1,
        params: { organizationId: "1" },
      });
      const res = createRes();
      const complianceData = {
        score: 85,
        modules: {
          riskManagement: { score: 90, weight: 0.2, qualityScore: 95 },
          vendorManagement: { score: 80, weight: 0.2, qualityScore: 85 },
          projectGovernance: { score: 85, weight: 0.2, qualityScore: 90 },
          modelLifecycle: { score: 88, weight: 0.2, qualityScore: 92 },
          policyDocumentation: { score: 82, weight: 0.2, qualityScore: 88 },
        },
      };
      mockCalc.mockResolvedValue(complianceData);

      await getComplianceDetails(req, res);

      expect(mockCalc).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.message).toBe("OK");
      expect(jsonCall.data).toHaveProperty("insights");
      expect(jsonCall.data.insights).toHaveProperty("strongestModule");
      expect(jsonCall.data.insights).toHaveProperty("weakestModule");
      expect(jsonCall.data.insights).toHaveProperty("improvementPriority");
      expect(jsonCall.data.insights).toHaveProperty("overallTrend");
      expect(jsonCall.data.insights).toHaveProperty("dataQuality");
    });

    it("should return 400 for invalid organization ID", async () => {
      const req = createReq({
        params: { organizationId: "abc" },
      });
      const res = createRes();

      await getComplianceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid organization ID",
      });
    });

    it("should return 403 for unauthorized organization", async () => {
      const req = createReq({
        organizationId: 1,
        params: { organizationId: "99" },
      });
      const res = createRes();

      await getComplianceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Access denied: User does not have permission to access this organization's compliance details",
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq({
        organizationId: 1,
        params: { organizationId: "1" },
      });
      const res = createRes();
      const error = new Error("Database connection failed");
      mockCalc.mockRejectedValue(error);

      await getComplianceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: error.message,
      });
    });
  });
});
