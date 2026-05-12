import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/risk.utils", () => ({
  bulkSetProjectRisksOwnerQuery: jest.fn<any>().mockResolvedValue(undefined),
  bulkSetProjectRisksCategoryQuery: jest.fn<any>().mockResolvedValue(undefined),
  bulkArchiveProjectRisksQuery: jest.fn<any>().mockResolvedValue(undefined),
  PROJECT_RISK_CATEGORIES: ["Strategic risk", "Operational risk"],
  PROJECT_RISK_CATEGORIES_SET: new Set(["Strategic risk", "Operational risk"]),
  // Other exports used by risks.ctrl — provide noop mocks.
  deleteRiskByIdQuery: jest.fn(),
  getAllRisksQuery: jest.fn(),
  getRiskByIdQuery: jest.fn(),
  getRisksByFrameworkQuery: jest.fn(),
  getRisksByProjectQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
}));

jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn<any>(),
  assertOrgOwnsIds: jest.fn<any>().mockResolvedValue(undefined),
  withBulkTransaction: jest.fn<any>(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn<any>(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

// Other module-level imports the controller pulls in.
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn(),
}));
jest.mock("../../utils/projectRiskChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
  trackProjectRiskChanges: jest.fn(),
  recordProjectRiskDeletion: jest.fn(),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn(),
}));
jest.mock("../../utils/quantitativeRisk.utils", () => ({
  computeDerivedFields: jest.fn(),
  recordPortfolioSnapshot: jest.fn(),
}));
jest.mock("../../utils/validations/quantitativeRiskValidation.utils", () => ({
  validateQuantitativeRiskFields: jest.fn(),
}));
jest.mock("../../services/risk.service", () => ({
  createRiskService: jest.fn(),
}));
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { bulkUpdateProjectRisks } from "../risks.ctrl";
import {
  bulkSetProjectRisksOwnerQuery,
  bulkSetProjectRisksCategoryQuery,
  bulkArchiveProjectRisksQuery,
} from "../../utils/risk.utils";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../../utils/bulkAction.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const mockParseBulkIds = parseBulkIds as jest.MockedFunction<typeof parseBulkIds>;
const mockAssertOrgOwnsIds = assertOrgOwnsIds as jest.MockedFunction<typeof assertOrgOwnsIds>;
const mockWithBulkTransaction = withBulkTransaction as jest.MockedFunction<
  typeof withBulkTransaction
>;
const mockSetOwner = bulkSetProjectRisksOwnerQuery as jest.MockedFunction<
  typeof bulkSetProjectRisksOwnerQuery
>;
const mockSetCategory = bulkSetProjectRisksCategoryQuery as jest.MockedFunction<
  typeof bulkSetProjectRisksCategoryQuery
>;
const mockArchive = bulkArchiveProjectRisksQuery as jest.MockedFunction<
  typeof bulkArchiveProjectRisksQuery
>;

function createReq(body: any): Partial<Request> {
  return {
    userId: 9,
    organizationId: 4,
    role: "Editor",
    body,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("bulkUpdateProjectRisks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseBulkIds.mockImplementation((input: any) => {
      if (!Array.isArray(input) || input.length === 0) {
        throw new ValidationException("ids must be a non-empty array", "ids", input);
      }
      return input.map((n: any) => Number(n));
    });
    mockWithBulkTransaction.mockImplementation(async (_options: any, handler: any) =>
      handler({} as any),
    );
  });

  it("returns 200 and runs set_owner for a happy-path call", async () => {
    const req = createReq({ ids: [1, 2], action: "set_owner", ownerId: 7 });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(mockAssertOrgOwnsIds).toHaveBeenCalledWith(
      expect.objectContaining({ table: "risks", ids: [1, 2], organizationId: 4 }),
    );
    expect(mockSetOwner).toHaveBeenCalledWith(4, [1, 2], 7, expect.anything());
    expect(mockSetCategory).not.toHaveBeenCalled();
    expect(mockArchive).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { updated: 2, action: "set_owner" },
    });
  });

  it("returns 400 when set_owner is missing ownerId", async () => {
    const req = createReq({ ids: [1], action: "set_owner" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetOwner).not.toHaveBeenCalled();
  });

  it("returns 400 when ownerId is non-positive", async () => {
    const req = createReq({ ids: [1], action: "set_owner", ownerId: -3 });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 and runs set_category with valid categories from the predefined enum", async () => {
    const req = createReq({
      ids: [1],
      action: "set_category",
      categories: ["Strategic risk", "Operational risk"],
    });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(mockSetCategory).toHaveBeenCalledWith(
      4,
      [1],
      ["Strategic risk", "Operational risk"],
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when set_category receives an unknown category", async () => {
    const req = createReq({
      ids: [1],
      action: "set_category",
      categories: ["Imaginary risk"],
    });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetCategory).not.toHaveBeenCalled();
  });

  it("returns 400 when set_category receives a non-array", async () => {
    const req = createReq({
      ids: [1],
      action: "set_category",
      categories: "Strategic risk",
    });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 and runs archive (soft-delete)", async () => {
    const req = createReq({ ids: [10, 11, 12], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(mockArchive).toHaveBeenCalledWith(4, [10, 11, 12], expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 for an unknown action", async () => {
    const req = createReq({ ids: [1], action: "rename" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithBulkTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when ids is empty", async () => {
    const req = createReq({ ids: [], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 when the tenant guard rejects (cross-org access)", async () => {
    mockAssertOrgOwnsIds.mockRejectedValueOnce(
      new ForbiddenException("Cross-tenant access", "risks", "bulk_action"),
    );

    const req = createReq({ ids: [99], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    mockWithBulkTransaction.mockImplementationOnce(async () => {
      throw new Error("db exploded");
    });

    const req = createReq({ ids: [1], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
