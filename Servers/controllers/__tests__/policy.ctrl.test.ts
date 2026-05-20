import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/policyManager.utils", () => ({
  createPolicyQuery: jest.fn(),
  deletePolicyByIdQuery: jest.fn(),
  getAllPoliciesQuery: jest.fn(),
  getPolicyByIdQuery: jest.fn(),
  updatePolicyByIdQuery: jest.fn(),
  updatePolicyReviewStatusQuery: jest.fn(),
  bulkArchivePoliciesQuery: jest.fn(),
  bulkSetPoliciesReviewerQuery: jest.fn(),
  bulkSetPoliciesTagsQuery: jest.fn(),
}));
jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn((ids: number[]) => ids),
  assertOrgOwnsIds: jest.fn().mockResolvedValue(undefined),
  withBulkTransaction: jest.fn().mockImplementation(async (_opts: any, fn: any) => {
    const transaction = { commit: jest.fn(), rollback: jest.fn() };
    await fn(transaction);
  }),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn().mockResolvedValue([{ name: "Test", surname: "User" }]),
  },
}));
jest.mock("../../utils/policyChangeHistory.utils", () => ({
  recordPolicyCreation: jest.fn().mockResolvedValue(undefined),
  trackPolicyChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/policies/policyExporter", () => ({
  generatePolicyPDF: jest.fn().mockResolvedValue(Buffer.from("pdf")),
  generatePolicyDOCX: jest.fn().mockResolvedValue(Buffer.from("docx")),
  generateFilename: jest.fn().mockReturnValue("file.pdf"),
}));
jest.mock("../../services/policies/policyImporter", () => ({
  convertDocxToHtml: jest.fn().mockResolvedValue({ html: "<p>hi</p>", warnings: [] }),
  DOCX_ALLOWED_MIMES: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyReviewRequested: jest.fn().mockResolvedValue(undefined),
  notifyReviewApproved: jest.fn().mockResolvedValue(undefined),
  notifyReviewRejected: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
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
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ForbiddenException: class ForbiddenException extends Error {},
  ValidationException: class ValidationException extends Error {},
}));

import { PolicyController } from "../policy.ctrl";
import {
  getAllPoliciesQuery,
  getPolicyByIdQuery,
  createPolicyQuery,
  updatePolicyByIdQuery,
  deletePolicyByIdQuery,
} from "../../utils/policyManager.utils";
import { generatePolicyPDF } from "../../services/policies/policyExporter";
import { convertDocxToHtml } from "../../services/policies/policyImporter";
import { ForbiddenException } from "../../domain.layer/exceptions/custom.exception";

const mockGetAll = getAllPoliciesQuery as jest.MockedFunction<typeof getAllPoliciesQuery>;
const mockGetById = getPolicyByIdQuery as jest.MockedFunction<typeof getPolicyByIdQuery>;
const mockCreate = createPolicyQuery as jest.MockedFunction<typeof createPolicyQuery>;
const mockUpdate = updatePolicyByIdQuery as jest.MockedFunction<typeof updatePolicyByIdQuery>;
const mockDelete = deletePolicyByIdQuery as jest.MockedFunction<typeof deletePolicyByIdQuery>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    file: undefined,
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.send = jest.fn<any>().mockReturnValue(res);
  res.setHeader = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("policy.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllPolicies", () => {
    it("should return 200 with policies", async () => {
      mockGetAll.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      const req = createReq();
      const res = createRes();
      await PolicyController.getAllPolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await PolicyController.getAllPolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getPolicyById", () => {
    it("should return 200 when policy is found", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await PolicyController.getPolicyById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await PolicyController.getPolicyById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await PolicyController.getPolicyById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createPolicy", () => {
    it("should return 201 when policy is created", async () => {
      mockCreate.mockResolvedValue({ id: 1, title: "P1" } as any);
      const req = createReq({ body: { title: "P1", content_html: "<p>test</p>" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 503 when creation returns null", async () => {
      mockCreate.mockResolvedValue(null as any);
      const req = createReq({ body: { title: "P1" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
    it("should return 500 on error", async () => {
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { title: "P1" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updatePolicy", () => {
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "99" }, body: { title: "P2" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 202 when policy is updated", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      mockUpdate.mockResolvedValue({ id: 1, title: "P2" } as any);
      const req = createReq({ params: { id: "1" }, body: { title: "P2" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 404 when update returns null", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      mockUpdate.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" }, body: { title: "P2" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { title: "P2" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deletePolicyById", () => {
    it("should return 202 when policy is deleted", async () => {
      mockDelete.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await PolicyController.deletePolicyById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 404 when policy is not found", async () => {
      mockDelete.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await PolicyController.deletePolicyById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockDelete.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await PolicyController.deletePolicyById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getPolicyTags", () => {
    it("should return 200 with tags", async () => {
      const req = createReq();
      const res = createRes();
      await PolicyController.getPolicyTags(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("exportPolicyPDF", () => {
    it("should return 400 for invalid policyId", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await PolicyController.exportPolicyPDF(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await PolicyController.exportPolicyPDF(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should send pdf when policy is found", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", content_html: "<p>test</p>" }] as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await PolicyController.exportPolicyPDF(req, res);
      expect(res.send).toHaveBeenCalled();
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await PolicyController.exportPolicyPDF(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("importDocx", () => {
    it("should return 400 when no file is uploaded", async () => {
      const req = createReq();
      const res = createRes();
      await PolicyController.importDocx(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 for invalid mime type", async () => {
      const req = createReq({
        file: {
          originalname: "test.txt",
          mimetype: "text/plain",
          buffer: Buffer.from("hi"),
        } as any,
      });
      const res = createRes();
      await PolicyController.importDocx(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 200 on successful import", async () => {
      const req = createReq({
        file: {
          originalname: "test.docx",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from("docx"),
        } as any,
      });
      const res = createRes();
      await PolicyController.importDocx(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      (convertDocxToHtml as jest.Mock).mockRejectedValueOnce(new Error("parse error"));
      const req = createReq({
        file: {
          originalname: "test.docx",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from("docx"),
        } as any,
      });
      const res = createRes();
      await PolicyController.importDocx(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("requestReview", () => {
    it("should return 400 for invalid policyId", async () => {
      const req = createReq({ params: { id: "abc" }, body: { reviewer_ids: [2] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 when reviewer_ids is missing", async () => {
      const req = createReq({ params: { id: "1" }, body: {} });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "99" }, body: { reviewer_ids: [2] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 on success", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", author_id: 1 }] as any);
      const req = createReq({ params: { id: "1" }, body: { reviewer_ids: [2] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { reviewer_ids: [2] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("approveReview", () => {
    it("should return 400 for invalid policyId", async () => {
      const req = createReq({ params: { id: "abc" }, body: { comment: "ok" } });
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "99" }, body: { comment: "ok" } });
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 on success", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", author_id: 1 }] as any);
      const req = createReq({ params: { id: "1" }, body: { comment: "ok" } });
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { comment: "ok" } });
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("rejectReview", () => {
    it("should return 400 for invalid policyId", async () => {
      const req = createReq({ params: { id: "abc" }, body: { comment: "fix" } });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 when comment is missing", async () => {
      const req = createReq({ params: { id: "1" }, body: {} });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "99" }, body: { comment: "fix" } });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 on success", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", author_id: 1 }] as any);
      const req = createReq({ params: { id: "1" }, body: { comment: "fix" } });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { comment: "fix" } });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("bulkUpdatePolicies", () => {
    it("should return 200 for archive action", async () => {
      const req = createReq({ body: { ids: [1, 2], action: "archive" } });
      const res = createRes();
      await PolicyController.bulkUpdatePolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 400 for invalid action", async () => {
      const req = createReq({ body: { ids: [1], action: "invalid" } });
      const res = createRes();
      await PolicyController.bulkUpdatePolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 for invalid reviewerId", async () => {
      const req = createReq({ body: { ids: [1], action: "set_reviewer", reviewerId: -1 } });
      const res = createRes();
      await PolicyController.bulkUpdatePolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 403 on ForbiddenException", async () => {
      const { assertOrgOwnsIds } = require("../../utils/bulkAction.utils");
      (assertOrgOwnsIds as jest.Mock).mockRejectedValueOnce(new ForbiddenException("denied"));
      const req = createReq({ body: { ids: [1], action: "archive" } });
      const res = createRes();
      await PolicyController.bulkUpdatePolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 500 on unexpected error", async () => {
      const { parseBulkIds } = require("../../utils/bulkAction.utils");
      (parseBulkIds as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const req = createReq({ body: { ids: [1], action: "archive" } });
      const res = createRes();
      await PolicyController.bulkUpdatePolicies(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
