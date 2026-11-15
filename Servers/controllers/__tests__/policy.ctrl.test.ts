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
  assertPolicyUsersInOrganization: jest.fn(),
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
jest.mock("../../services/policies/policyApproval.service", () => ({
  rejectPendingPolicyRequestOnDelete: jest.fn<any>().mockResolvedValue(null),
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
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(async (_org: any, role: string) => role === "Admin"),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ForbiddenException: class ForbiddenException extends Error {},
  // Mirrors the real class: the field lands in metadata.field.
  ValidationException: class ValidationException extends Error {
    metadata: Record<string, unknown>;
    constructor(message: string, field?: string) {
      super(message);
      this.metadata = { field };
    }
  },
}));

import { PolicyController } from "../policy.ctrl";
import { trackPolicyChanges } from "../../utils/policyChangeHistory.utils";
import {
  getAllPoliciesQuery,
  getPolicyByIdQuery,
  createPolicyQuery,
  updatePolicyByIdQuery,
  deletePolicyByIdQuery,
} from "../../utils/policyManager.utils";
import { generatePolicyPDF } from "../../services/policies/policyExporter";
import { rejectPendingPolicyRequestOnDelete } from "../../services/policies/policyApproval.service";
import { convertDocxToHtml } from "../../services/policies/policyImporter";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  updatePolicyReviewStatusQuery,
  assertPolicyUsersInOrganization,
} from "../../utils/policyManager.utils";

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

// The update gate locks the row, then reads pending requests. The module-wide
// query mock returns id-less rows, which would match as pending, so tests that
// change the title or content state the lock result.
const lockUnlockedRow = () => {
  const { sequelize } = require("../../database/db");
  (sequelize.query as jest.Mock<any>)
    .mockResolvedValueOnce([{ id: 1, title: "P1", status: "Draft" }])
    .mockResolvedValueOnce([]);
};

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
      const req = createReq({
        body: { title: "Policy one", status: "Draft", content_html: "<p>test</p>" },
      });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 503 when creation returns null", async () => {
      mockCreate.mockResolvedValue(null as any);
      const req = createReq({ body: { title: "Policy one", status: "Draft" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
    it("should return 500 on error", async () => {
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { title: "Policy one", status: "Draft" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("passes only editable fields, dropping is_demo and review fields", async () => {
      mockCreate.mockResolvedValue({ id: 1, title: "P1" } as any);
      const req = createReq({
        body: {
          title: "Policy one",
          status: "Draft",
          is_demo: true,
          review_status: "approved",
          organization_id: 99,
        },
      });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      const sent = mockCreate.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(sent.title).toBe("Policy one");
      expect(sent).not.toHaveProperty("is_demo");
      expect(sent).not.toHaveProperty("review_status");
      expect(sent).not.toHaveProperty("organization_id");
    });
    it("should return 400 when an owner or reviewer is outside the organization", async () => {
      mockCreate.mockRejectedValue(
        new ValidationException("Reviewers must be members of this organization"),
      );
      const req = createReq({
        body: { title: "Policy one", status: "Draft", assigned_reviewer_ids: [77] },
      });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("field validation (P-L6)", () => {
    it("returns 400 with a field error for a missing or over-long title on create", async () => {
      const req = createReq({ body: { title: "A".repeat(250) + " ".repeat(10) } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.data.errors.map((e: { field: string }) => e.field)).toEqual(["title"]);
      expect(mockCreate).not.toHaveBeenCalled();
    });
    it("keeps accepting what the legacy endpoint accepted: a short title, no status", async () => {
      mockCreate.mockResolvedValue({ id: 1, title: "P" } as any);
      for (const body of [{ title: "P" }, { title: "P", status: "Archived" }]) {
        const res = createRes();
        await PolicyController.createPolicy(createReq({ body }), res);
        expect(res.status).toHaveBeenCalledWith(201);
      }
    });
    it("returns 400 for an unknown tag and an invalid date", async () => {
      const req = createReq({
        body: {
          title: "Policy one",
          status: "Draft",
          tags: ["Not a tag"],
          next_review_date: "not a date",
        },
      });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const fields = res.json.mock.calls[0][0].data.errors.map((e: { field: string }) => e.field);
      expect(fields).toEqual(["tags", "next_review_date"]);
    });
    it("returns 400 for a valid date prefix followed by a malformed suffix", async () => {
      for (const next_review_date of ["2030-01-15garbage", "2030-01-15T25:99:99"]) {
        const req = createReq({ body: { title: "Policy one", status: "Draft", next_review_date } });
        const res = createRes();
        await PolicyController.createPolicy(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        const fields = res.json.mock.calls[0][0].data.errors.map((e: { field: string }) => e.field);
        expect(fields).toEqual(["next_review_date"]);
      }
      expect(mockCreate).not.toHaveBeenCalled();
    });
    it("accepts a create without tags or review date", async () => {
      mockCreate.mockResolvedValue({ id: 1, title: "Policy one" } as any);
      const req = createReq({ body: { title: "Policy one", status: "Draft" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("checks only the fields an update sends", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "Policy one" }] as any);
      const req = createReq({ params: { id: "1" }, body: { status: "" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].data.errors).toEqual([
        { field: "status", message: "Choose a valid status" },
      ]);
    });
    it("maps a write-path ValidationException to a field error", async () => {
      mockCreate.mockRejectedValue(
        new ValidationException(
          "Reviewers must be members of this organization",
          "assigned_reviewer_ids",
        ),
      );
      const req = createReq({ body: { title: "Policy one", status: "Draft" } });
      const res = createRes();
      await PolicyController.createPolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].data.errors).toEqual([
        {
          field: "assigned_reviewer_ids",
          message: "Reviewers must be members of this organization",
        },
      ]);
    });
  });

  describe("status gate (S2)", () => {
    const { sequelize } = require("../../database/db");
    // The gate locks the row, then reads pending requests in a second statement.
    const lockRow = (status: string, hasPending = false) =>
      (sequelize.query as jest.Mock<any>)
        .mockResolvedValueOnce([{ id: 1, title: "P1", status }])
        .mockResolvedValueOnce(hasPending ? [{ entity_id: 1 }] : []);

    it.each(["Under Review", "Approved", "Published"])(
      "rejects creating a policy as %s with a status field error",
      async (status) => {
        const res = createRes();
        await PolicyController.createPolicy(createReq({ body: { title: "Policy", status } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].data.errors).toEqual([
          { field: "status", message: "A new policy can be draft, archived or deprecated" },
        ]);
        expect(mockCreate).not.toHaveBeenCalled();
      },
    );

    it.each(["Draft", "Archived", "Deprecated"])("creates a policy as %s", async (status) => {
      mockCreate.mockResolvedValue({ id: 1, title: "Policy" } as any);
      const res = createRes();
      await PolicyController.createPolicy(createReq({ body: { title: "Policy", status } }), res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it.each([
      ["Draft", "Under Review", "Submit the policy for approval to put it under review"],
      ["Draft", "Approved", "A policy is approved through its approval workflow or by an Admin"],
      ["Draft", "Published", "Only an approved policy can be published"],
      ["Published", "Draft", "Cannot move published policy back to draft"],
      ["Archived", "Draft", "Cannot restore archived policy to draft"],
    ])("rejects an update from %s to %s", async (current, next, message) => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", status: current }] as any);
      lockRow(current);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({ params: { id: "1" }, body: { status: next } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].data.errors).toEqual([{ field: "status", message }]);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("rejects a status change while an approval request is pending", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", status: "Under Review" }] as any);
      lockRow("Under Review", true);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({ params: { id: "1" }, body: { status: "Draft" } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].data.errors).toEqual([
        { field: "status", message: "Withdraw the approval request before changing the status" },
      ]);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("accepts the unchanged status and title on save while a request is pending", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", status: "Under Review" }] as any);
      lockRow("Under Review", true);
      mockUpdate.mockResolvedValue({ id: 1, title: "P1" } as any);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({ params: { id: "1" }, body: { title: "P1", status: "Under Review" } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it("does not track a content that sanitizes to empty, as it is not written", async () => {
      const existing = { id: 1, title: "P1", status: "Draft", content_html: "<p>Old</p>" };
      mockGetById.mockResolvedValue([existing] as any);
      lockRow("Draft");
      mockUpdate.mockResolvedValue({ id: 1 } as any);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({
          params: { id: "1" },
          // sanitizes to an empty string, which the write skips
          body: { content_html: "<script>alert(1)</script>", status: "Draft" },
        }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
      const tracked = (trackPolicyChanges as jest.Mock<any>).mock.calls.at(-1)![1];
      expect(tracked).not.toHaveProperty("content_html");
      expect(tracked.status).toBe("Draft");
    });

    it("tracks a real content change with the value that was written", async () => {
      const existing = { id: 1, title: "P1", status: "Draft", content_html: "<p>Old</p>" };
      mockGetById.mockResolvedValue([existing] as any);
      lockRow("Draft");
      mockUpdate.mockResolvedValue({ id: 1 } as any);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({ params: { id: "1" }, body: { content_html: "<p>New</p>", status: "Draft" } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
      const [old, tracked] = (trackPolicyChanges as jest.Mock<any>).mock.calls.at(-1)!;
      expect(old).toBe(existing);
      expect(tracked.content_html).toBe("<p>New</p>");
    });

    it("publishes an approved policy and locks the row in the update transaction", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", status: "Approved" }] as any);
      lockRow("Approved");
      mockUpdate.mockResolvedValue({ id: 1, status: "Published" } as any);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({ params: { id: "1" }, body: { status: "Published" } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
      const [sql, options] = (sequelize.query as jest.Mock<any>).mock.calls[0];
      expect(sql).toContain("FOR UPDATE");
      expect(options.replacements).toEqual(
        expect.objectContaining({ organizationId: 1, policyIds: [1] }),
      );
      expect(options.transaction).toBeDefined();
    });

    it("does not lock the row when the update sends no status, title or content", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", status: "Draft" }] as any);
      mockUpdate.mockResolvedValue({ id: 1, title: "P1" } as any);
      const res = createRes();
      await PolicyController.updatePolicy(
        createReq({ params: { id: "1" }, body: { next_review_date: "2027-01-01" } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
      expect(sequelize.query).not.toHaveBeenCalled();
    });

    describe("title and content while a request is pending", () => {
      const lockTextRow = (hasPending: boolean) =>
        (sequelize.query as jest.Mock<any>)
          .mockResolvedValueOnce([
            { id: 1, title: "P1", status: "Under Review", content_html: "<p>v1</p>" },
          ])
          .mockResolvedValueOnce(hasPending ? [{ entity_id: 1 }] : []);
      const lockedMessage =
        "This policy is waiting for approval. Withdraw the request to change its title or content.";

      beforeEach(() => {
        mockGetById.mockResolvedValue([
          { id: 1, title: "P1", status: "Under Review", content_html: "<p>v1</p>" },
        ] as any);
        mockUpdate.mockResolvedValue({ id: 1, title: "P1" } as any);
      });

      it("rejects a changed title with a title field error", async () => {
        lockTextRow(true);
        const res = createRes();
        await PolicyController.updatePolicy(
          createReq({ params: { id: "1" }, body: { title: "Renamed", status: "Under Review" } }),
          res,
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].data.errors).toEqual([
          { field: "title", message: lockedMessage },
        ]);
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("rejects changed content with a content_html field error", async () => {
        lockTextRow(true);
        const res = createRes();
        await PolicyController.updatePolicy(
          createReq({ params: { id: "1" }, body: { title: "P1", content_html: "<p>v2</p>" } }),
          res,
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].data.errors).toEqual([
          { field: "content_html", message: lockedMessage },
        ]);
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("saves other fields with the stored title and content", async () => {
        lockTextRow(true);
        const res = createRes();
        await PolicyController.updatePolicy(
          createReq({
            params: { id: "1" },
            body: {
              title: "P1",
              content_html: "<p>v1</p>",
              status: "Under Review",
              next_review_date: "2027-01-01",
            },
          }),
          res,
        );
        expect(res.status).toHaveBeenCalledWith(202);
        expect(mockUpdate).toHaveBeenCalled();
      });

      it("ignores empty content, which the update does not write", async () => {
        lockTextRow(true);
        const res = createRes();
        await PolicyController.updatePolicy(
          createReq({ params: { id: "1" }, body: { content_html: "", status: "Under Review" } }),
          res,
        );
        expect(res.status).toHaveBeenCalledWith(202);
      });

      it("saves changed text when no request is pending", async () => {
        lockTextRow(false);
        const res = createRes();
        await PolicyController.updatePolicy(
          createReq({ params: { id: "1" }, body: { title: "Renamed", content_html: "<p>v2</p>" } }),
          res,
        );
        expect(res.status).toHaveBeenCalledWith(202);
        const [sql, options] = (sequelize.query as jest.Mock<any>).mock.calls[0];
        expect(sql).toContain("FOR UPDATE");
        expect(options.replacements).toEqual({ organizationId: 1, policyIds: [1] });
      });
    });

    it("bulk archive returns 400 naming the policies with a pending request and archives none", async () => {
      const { bulkArchivePoliciesQuery } = require("../../utils/policyManager.utils");
      (sequelize.query as jest.Mock<any>)
        .mockResolvedValueOnce([
          { id: 1, title: "Alpha", status: "Under Review" },
          { id: 2, title: "Beta", status: "Draft" },
        ])
        .mockResolvedValueOnce([{ entity_id: 1 }]);
      const res = createRes();
      await PolicyController.bulkUpdatePolicies(
        createReq({ body: { ids: [1, 2], action: "archive" } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].data).toBe(
        'Withdraw the approval request before archiving these policies: "Alpha"',
      );
      expect(bulkArchivePoliciesQuery).not.toHaveBeenCalled();
    });
  });

  describe("updatePolicy", () => {
    it("should return 404 when policy is not found", async () => {
      mockGetById.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "99" }, body: { title: "Policy two" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 202 when policy is updated", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      lockUnlockedRow();
      mockUpdate.mockResolvedValue({ id: 1, title: "P2" } as any);
      const req = createReq({ params: { id: "1" }, body: { title: "Policy two" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 404 when update returns null", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      lockUnlockedRow();
      mockUpdate.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" }, body: { title: "Policy two" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { title: "Policy two" } });
      const res = createRes();
      await PolicyController.updatePolicy(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("save response shape", () => {
    it("should return the persisted entity including status and last_updated_at for create and update", async () => {
      const persisted = {
        id: 1,
        title: "P1",
        content_html: "<p>test</p>",
        status: "Under Review",
        last_updated_by: 1,
        last_updated_at: "2026-08-05T00:00:00.000Z",
      };

      // POST /policies — 201 body carries the full persisted row
      mockCreate.mockResolvedValue(persisted as any);
      const createReqObj = createReq({
        body: { title: "Policy one", status: "Draft", content_html: "<p>test</p>" },
      });
      const createResObj = createRes();
      await PolicyController.createPolicy(createReqObj, createResObj);
      expect(createResObj.status).toHaveBeenCalledWith(201);
      expect(createResObj.json).toHaveBeenCalledWith({
        message: "Created",
        data: expect.objectContaining({
          id: 1,
          status: "Under Review",
          last_updated_at: "2026-08-05T00:00:00.000Z",
        }),
      });

      // PUT /policies/:id — 202 body carries the full persisted row
      mockGetById.mockResolvedValue([{ id: 1, title: "P1" }] as any);
      lockUnlockedRow();
      mockUpdate.mockResolvedValue({ ...persisted, title: "P2" } as any);
      const updateReqObj = createReq({ params: { id: "1" }, body: { title: "Policy two" } });
      const updateResObj = createRes();
      await PolicyController.updatePolicy(updateReqObj, updateResObj);
      expect(updateResObj.status).toHaveBeenCalledWith(202);
      expect(updateResObj.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: expect.objectContaining({
          id: 1,
          status: "Under Review",
          last_updated_at: "2026-08-05T00:00:00.000Z",
        }),
      });
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
    it("rejects a pending approval request inside the delete transaction", async () => {
      mockDelete.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "7" } });
      const res = createRes();
      await PolicyController.deletePolicyById(req, res);
      const reject = rejectPendingPolicyRequestOnDelete as jest.Mock;
      expect(reject).toHaveBeenCalledWith(1, 7, expect.anything());
      // Same transaction object as the delete.
      expect(reject.mock.calls[0][2]).toBe(mockDelete.mock.calls[0][3]);
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
    it("should return 400 when a reviewer id is not a positive integer", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", author_id: 1 }] as any);
      const req = createReq({ params: { id: "1" }, body: { reviewer_ids: ["x"] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(updatePolicyReviewStatusQuery).not.toHaveBeenCalled();
    });
    it("should return 400 and notify no one when a reviewer is outside the organization", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", author_id: 1 }] as any);
      (assertPolicyUsersInOrganization as jest.Mock<any>).mockRejectedValueOnce(
        new ValidationException("Reviewers must be members of this organization"),
      );
      const req = createReq({ params: { id: "1" }, body: { reviewer_ids: [77] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(updatePolicyReviewStatusQuery).not.toHaveBeenCalled();
    });
    it("should return 200 on success", async () => {
      mockGetById.mockResolvedValue([{ id: 1, title: "P1", author_id: 1 }] as any);
      const req = createReq({ params: { id: "1" }, body: { reviewer_ids: [2] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return the full updated policy entity in the response body", async () => {
      const fullPolicy = {
        id: 1,
        title: "P1",
        author_id: 1,
        status: "Under Review",
        tags: ["security"],
        assigned_reviewer_ids: [2],
        last_updated_by: 1,
        last_updated_at: "2026-08-14T00:00:00.000Z",
      };
      mockGetById.mockResolvedValue([fullPolicy] as any);
      const req = createReq({ params: { id: "1" }, body: { reviewer_ids: [2] } });
      const res = createRes();
      await PolicyController.requestReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({
          id: 1,
          title: "P1",
          status: "Under Review",
          assigned_reviewer_ids: [2],
          last_updated_at: "2026-08-14T00:00:00.000Z",
        }),
      });
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
      mockGetById.mockResolvedValue([
        { id: 1, title: "P1", author_id: 1, review_status: "pending_review" },
      ] as any);
      const req = createReq({ params: { id: "1" }, body: { comment: "ok" } });
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return the full approved policy entity in the response body", async () => {
      const fullPolicy = {
        id: 1,
        title: "P1",
        author_id: 1,
        review_status: "pending_review",
        status: "Approved",
        tags: ["security"],
        assigned_reviewer_ids: [2],
        last_updated_by: 1,
        last_updated_at: "2026-08-14T00:00:00.000Z",
      };
      mockGetById.mockResolvedValue([fullPolicy] as any);
      const req = createReq({ params: { id: "1" }, body: { comment: "ok" } });
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({
          id: 1,
          title: "P1",
          status: "Approved",
          assigned_reviewer_ids: [2],
        }),
      });
    });
    it("lets an assigned reviewer of any role approve", async () => {
      mockGetById.mockResolvedValue([
        {
          id: 1,
          title: "P1",
          author_id: 1,
          assigned_reviewer_ids: [7],
          review_status: "pending_review",
        },
      ] as any);
      const req = createReq({ userId: 7, role: "Auditor", params: { id: "1" }, body: {} } as any);
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("returns 403 when the caller is neither an assigned reviewer nor an Admin", async () => {
      mockGetById.mockResolvedValue([
        {
          id: 1,
          title: "P1",
          author_id: 1,
          assigned_reviewer_ids: [7],
          review_status: "pending_review",
        },
      ] as any);
      const req = createReq({ userId: 8, role: "Editor", params: { id: "1" }, body: {} } as any);
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(updatePolicyReviewStatusQuery).not.toHaveBeenCalled();
    });
    it("returns 403 when the author assigned themselves as reviewer", async () => {
      mockGetById.mockResolvedValue([
        {
          id: 1,
          title: "P1",
          author_id: 7,
          assigned_reviewer_ids: [7],
          review_status: "pending_review",
        },
      ] as any);
      const req = createReq({ userId: 7, role: "Editor", params: { id: "1" }, body: {} } as any);
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("returns 400 when the policy is not awaiting review", async () => {
      mockGetById.mockResolvedValue([
        { id: 1, title: "P1", author_id: 1, assigned_reviewer_ids: [7], review_status: "approved" },
      ] as any);
      const req = createReq({ userId: 7, role: "Reviewer", params: { id: "1" }, body: {} } as any);
      const res = createRes();
      await PolicyController.approveReview(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(updatePolicyReviewStatusQuery).not.toHaveBeenCalled();
    });
    it("lets an unassigned Admin approve", async () => {
      mockGetById.mockResolvedValue([
        {
          id: 1,
          title: "P1",
          author_id: 1,
          assigned_reviewer_ids: [7],
          review_status: "pending_review",
        },
      ] as any);
      const req = createReq({ userId: 8, role: "Admin", params: { id: "1" }, body: {} } as any);
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
      mockGetById.mockResolvedValue([
        { id: 1, title: "P1", author_id: 1, review_status: "pending_review" },
      ] as any);
      const req = createReq({ params: { id: "1" }, body: { comment: "fix" } });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return the full rejected policy entity in the response body", async () => {
      const fullPolicy = {
        id: 1,
        title: "P1",
        author_id: 1,
        review_status: "pending_review",
        status: "Changes Requested",
        tags: ["security"],
        assigned_reviewer_ids: [2],
        last_updated_by: 1,
        last_updated_at: "2026-08-14T00:00:00.000Z",
      };
      mockGetById.mockResolvedValue([fullPolicy] as any);
      const req = createReq({ params: { id: "1" }, body: { comment: "fix" } });
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({
          id: 1,
          title: "P1",
          status: "Changes Requested",
          assigned_reviewer_ids: [2],
        }),
      });
    });
    it("returns 403 when the caller is neither an assigned reviewer nor an Admin", async () => {
      mockGetById.mockResolvedValue([
        {
          id: 1,
          title: "P1",
          author_id: 1,
          assigned_reviewer_ids: [7],
          review_status: "pending_review",
        },
      ] as any);
      const req = createReq({
        userId: 8,
        role: "Auditor",
        params: { id: "1" },
        body: { comment: "fix" },
      } as any);
      const res = createRes();
      await PolicyController.rejectReview(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(updatePolicyReviewStatusQuery).not.toHaveBeenCalled();
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
      const { sequelize } = require("../../database/db");
      (sequelize.query as jest.Mock<any>)
        .mockResolvedValueOnce([
          { id: 1, title: "A", status: "Draft" },
          { id: 2, title: "B", status: "Published" },
        ])
        .mockResolvedValueOnce([]);
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
