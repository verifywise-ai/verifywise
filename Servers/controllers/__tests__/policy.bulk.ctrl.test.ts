import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/policyManager.utils", () => ({
  bulkArchivePoliciesQuery: jest.fn<any>().mockResolvedValue(undefined),
  bulkSetPoliciesReviewerQuery: jest.fn<any>().mockResolvedValue(undefined),
  bulkSetPoliciesTagsQuery: jest.fn<any>().mockResolvedValue(undefined),
  // Other exports policy.ctrl imports — provide noop mocks so the module loads.
  createPolicyQuery: jest.fn(),
  deletePolicyByIdQuery: jest.fn(),
  getAllPoliciesQuery: jest.fn(),
  getPolicyByIdQuery: jest.fn(),
  updatePolicyByIdQuery: jest.fn(),
  updatePolicyReviewStatusQuery: jest.fn(),
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
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

jest.mock("../../utils/policyChangeHistory.utils", () => ({
  recordPolicyCreation: jest.fn(),
  trackPolicyChanges: jest.fn(),
  recordMultipleFieldChanges: jest.fn(),
}));

jest.mock("../../services/policies/policyExporter", () => ({
  generatePolicyPDF: jest.fn(),
  generatePolicyDOCX: jest.fn(),
  generateFilename: jest.fn(),
}));

jest.mock("../../services/policies/policyImporter", () => ({
  convertDocxToHtml: jest.fn(),
  DOCX_ALLOWED_MIMES: [],
}));

jest.mock("../../services/inAppNotification.service", () => ({
  notifyReviewRequested: jest.fn(),
  notifyReviewApproved: jest.fn(),
  notifyReviewRejected: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import { PolicyController } from "../policy.ctrl";
import {
  bulkArchivePoliciesQuery,
  bulkSetPoliciesReviewerQuery,
  bulkSetPoliciesTagsQuery,
} from "../../utils/policyManager.utils";
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
const mockArchive = bulkArchivePoliciesQuery as jest.MockedFunction<
  typeof bulkArchivePoliciesQuery
>;
const mockSetReviewer = bulkSetPoliciesReviewerQuery as jest.MockedFunction<
  typeof bulkSetPoliciesReviewerQuery
>;
const mockSetTags = bulkSetPoliciesTagsQuery as jest.MockedFunction<
  typeof bulkSetPoliciesTagsQuery
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

describe("bulkUpdatePolicies", () => {
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

  it("returns 200 and runs archive for a happy-path call", async () => {
    const req = createReq({ ids: [1, 2, 3], action: "archive" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(mockAssertOrgOwnsIds).toHaveBeenCalledWith(
      expect.objectContaining({ table: "policy_manager", ids: [1, 2, 3], organizationId: 4 }),
    );
    expect(mockArchive).toHaveBeenCalledWith(4, [1, 2, 3], 9, expect.anything());
    expect(mockSetReviewer).not.toHaveBeenCalled();
    expect(mockSetTags).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { updated: 3, action: "archive" },
    });
  });

  it("returns 200 and runs set_reviewer when a positive reviewerId is supplied", async () => {
    const req = createReq({ ids: [10, 11], action: "set_reviewer", reviewerId: 7 });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(mockSetReviewer).toHaveBeenCalledWith(4, [10, 11], 7, expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when reviewerId is missing or invalid for set_reviewer", async () => {
    const req = createReq({ ids: [1], action: "set_reviewer" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetReviewer).not.toHaveBeenCalled();
  });

  it("returns 200 and runs set_tags with valid tags from the predefined enum", async () => {
    const req = createReq({
      ids: [1],
      action: "set_tags",
      tags: ["AI ethics", "Privacy"],
    });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(mockSetTags).toHaveBeenCalledWith(4, [1], ["AI ethics", "Privacy"], expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when set_tags receives a tag outside the predefined enum", async () => {
    const req = createReq({
      ids: [1],
      action: "set_tags",
      tags: ["Not a real tag"],
    });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetTags).not.toHaveBeenCalled();
  });

  it("returns 400 when set_tags is given a non-array", async () => {
    const req = createReq({ ids: [1], action: "set_tags", tags: "Privacy" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for an unknown action", async () => {
    const req = createReq({ ids: [1], action: "nuke" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithBulkTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when ids is empty", async () => {
    const req = createReq({ ids: [], action: "archive" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 when the tenant guard rejects (cross-org access)", async () => {
    mockAssertOrgOwnsIds.mockRejectedValueOnce(
      new ForbiddenException("Cross-tenant access", "policy_manager", "bulk_action"),
    );

    const req = createReq({ ids: [99], action: "archive" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    mockWithBulkTransaction.mockImplementationOnce(async () => {
      throw new Error("db exploded");
    });

    const req = createReq({ ids: [1], action: "archive" });
    const res = createRes();

    await PolicyController.bulkUpdatePolicies(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
