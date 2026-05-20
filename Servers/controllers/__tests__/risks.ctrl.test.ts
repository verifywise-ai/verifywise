import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/risk.utils", () => ({
  getAllRisksQuery: jest.fn(),
  getRiskByIdQuery: jest.fn(),
  getRisksByFrameworkQuery: jest.fn(),
  getRisksByProjectQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
  deleteRiskByIdQuery: jest.fn(),
  bulkSetProjectRisksOwnerQuery: jest.fn(),
  bulkSetProjectRisksCategoryQuery: jest.fn(),
  bulkArchiveProjectRisksQuery: jest.fn(),
  PROJECT_RISK_CATEGORIES_SET: new Set(["financial", "operational", "strategic", "compliance"]),
}));
jest.mock("../../domain.layer/models/risks/risk.model", () => ({
  RiskModel: jest.fn(),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn().mockResolvedValue([[]]),
  },
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
}));
jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn((ids: number[]) => ids),
  assertOrgOwnsIds: jest.fn().mockResolvedValue(undefined),
  withBulkTransaction: jest.fn().mockImplementation(async (_opts: any, fn: any) => {
    const transaction = { commit: jest.fn(), rollback: jest.fn() };
    await fn(transaction);
  }),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/projectRiskChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
  trackProjectRiskChanges: jest.fn().mockResolvedValue([]),
  recordProjectRiskDeletion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/quantitativeRisk.utils", () => ({
  computeDerivedFields: jest.fn().mockReturnValue({}),
  recordPortfolioSnapshot: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/validations/quantitativeRiskValidation.utils", () => ({
  validateQuantitativeRiskFields: jest.fn().mockReturnValue([]),
}));
jest.mock("../../services/risk.service", () => ({
  createRiskService: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    503: (d: any) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));

import {
  getAllRisks,
  getRisksByProject,
  getRisksByFramework,
  getRiskById,
  createRisk,
  updateRiskById,
  deleteRiskById,
  bulkUpdateProjectRisks,
} from "../risks.ctrl";
import {
  getAllRisksQuery,
  getRiskByIdQuery,
  getRisksByFrameworkQuery,
  getRisksByProjectQuery,
  updateRiskByIdQuery,
  deleteRiskByIdQuery,
  bulkSetProjectRisksOwnerQuery,
  bulkSetProjectRisksCategoryQuery,
  bulkArchiveProjectRisksQuery,
} from "../../utils/risk.utils";
import { createRiskService } from "../../services/risk.service";
import {
  ValidationException,
  ForbiddenException,
} from "../../domain.layer/exceptions/custom.exception";

const mockGetAll = getAllRisksQuery as jest.MockedFunction<typeof getAllRisksQuery>;
const mockGetById = getRiskByIdQuery as jest.MockedFunction<typeof getRiskByIdQuery>;
const mockGetByFramework = getRisksByFrameworkQuery as jest.MockedFunction<
  typeof getRisksByFrameworkQuery
>;
const mockGetByProject = getRisksByProjectQuery as jest.MockedFunction<
  typeof getRisksByProjectQuery
>;
const mockUpdate = updateRiskByIdQuery as jest.MockedFunction<typeof updateRiskByIdQuery>;
const mockDelete = deleteRiskByIdQuery as jest.MockedFunction<typeof deleteRiskByIdQuery>;
const mockCreateService = createRiskService as jest.MockedFunction<typeof createRiskService>;
const mockBulkOwner = bulkSetProjectRisksOwnerQuery as jest.MockedFunction<
  typeof bulkSetProjectRisksOwnerQuery
>;
const mockBulkCategory = bulkSetProjectRisksCategoryQuery as jest.MockedFunction<
  typeof bulkSetProjectRisksCategoryQuery
>;
const mockBulkArchive = bulkArchiveProjectRisksQuery as jest.MockedFunction<
  typeof bulkArchiveProjectRisksQuery
>;

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
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("risks.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllRisks", () => {
    it("should return 200 with risks when data exists", async () => {
      const data = [{ id: 1, risk_name: "R1" }];
      mockGetAll.mockResolvedValue(data as any);
      const req = createReq();
      const res = createRes();
      await getAllRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data }));
    });
    it("should return 204 when no risks exist", async () => {
      mockGetAll.mockResolvedValue(null as any);
      const req = createReq();
      const res = createRes();
      await getAllRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getRisksByProject", () => {
    it("should return 200 with empty array for non-numeric projectId", async () => {
      const req = createReq({ params: { id: "plugin-1" } });
      const res = createRes();
      await getRisksByProject(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    });
    it("should return 200 with risks when data exists", async () => {
      const data = [{ id: 1, risk_name: "R1" }];
      mockGetByProject.mockResolvedValue(data as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRisksByProject(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 204 when no risks exist", async () => {
      mockGetByProject.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRisksByProject(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
    it("should return 500 on error", async () => {
      mockGetByProject.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRisksByProject(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getRisksByFramework", () => {
    it("should return 200 with risks when data exists", async () => {
      const data = [{ id: 1, risk_name: "R1" }];
      mockGetByFramework.mockResolvedValue(data as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRisksByFramework(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 204 when no risks exist", async () => {
      mockGetByFramework.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRisksByFramework(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
    it("should return 500 on error", async () => {
      mockGetByFramework.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRisksByFramework(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getRiskById", () => {
    it("should return 200 when risk is found", async () => {
      const risk = { id: 1, risk_name: "R1" };
      mockGetById.mockResolvedValue(risk as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: risk }));
    });
    it("should return 204 when risk is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createRisk", () => {
    it("should return 201 when risk is created successfully", async () => {
      const risk = { id: 1, risk_name: "R1", risk_owner: null, ale_estimate: null };
      mockCreateService.mockResolvedValue(risk as any);
      const req = createReq({ body: { risk_name: "R1", projects: [], frameworks: [] } });
      const res = createRes();
      await createRisk(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: risk }));
    });
    it("should return 400 when creation returns null", async () => {
      mockCreateService.mockResolvedValue(null as any);
      const req = createReq({ body: { risk_name: "R1" } });
      const res = createRes();
      await createRisk(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 500 on unexpected error", async () => {
      mockCreateService.mockRejectedValue(new Error("boom"));
      const req = createReq({ body: { risk_name: "R1" } });
      const res = createRes();
      await createRisk(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateRiskById", () => {
    it("should return 404 when risk is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, body: { risk_name: "R2" } });
      const res = createRes();
      await updateRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 when risk is updated", async () => {
      const existing = { id: 1, risk_name: "R1", risk_owner: null, event_frequency_min: null };
      const updated = { id: 1, risk_name: "R2", risk_owner: null };
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const req = createReq({ params: { id: "1" }, body: { risk_name: "R2" } });
      const res = createRes();
      await updateRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: updated }));
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { risk_name: "R2" } });
      const res = createRes();
      await updateRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteRiskById", () => {
    it("should return 200 when risk is deleted", async () => {
      const risk = { id: 1, risk_name: "R1" };
      mockDelete.mockResolvedValue(risk as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: risk }));
    });
    it("should return 404 when risk is not found", async () => {
      mockDelete.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockDelete.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRiskById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("bulkUpdateProjectRisks", () => {
    it("should return 200 for set_owner action", async () => {
      const req = createReq({ body: { ids: [1, 2], action: "set_owner", ownerId: 3 } });
      const res = createRes();
      await bulkUpdateProjectRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { updated: 2, action: "set_owner" } }),
      );
    });
    it("should return 200 for archive action", async () => {
      const req = createReq({ body: { ids: [1], action: "archive" } });
      const res = createRes();
      await bulkUpdateProjectRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { updated: 1, action: "archive" } }),
      );
    });
    it("should return 400 for invalid action", async () => {
      const req = createReq({ body: { ids: [1], action: "invalid" } });
      const res = createRes();
      await bulkUpdateProjectRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 for invalid ownerId", async () => {
      const req = createReq({ body: { ids: [1], action: "set_owner", ownerId: -1 } });
      const res = createRes();
      await bulkUpdateProjectRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 403 on ForbiddenException", async () => {
      const { assertOrgOwnsIds } = require("../../utils/bulkAction.utils");
      (assertOrgOwnsIds as jest.Mock).mockRejectedValueOnce(new ForbiddenException("denied"));
      const req = createReq({ body: { ids: [1], action: "archive" } });
      const res = createRes();
      await bulkUpdateProjectRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 500 on unexpected error", async () => {
      const { parseBulkIds } = require("../../utils/bulkAction.utils");
      (parseBulkIds as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const req = createReq({ body: { ids: [1], action: "archive" } });
      const res = createRes();
      await bulkUpdateProjectRisks(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
