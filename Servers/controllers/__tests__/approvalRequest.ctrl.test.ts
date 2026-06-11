import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/approvalRequest.utils", () => ({
  createApprovalRequestQuery: jest.fn(),
  getMyApprovalRequestsQuery: jest.fn(),
  getPendingApprovalsQuery: jest.fn(),
  getApprovalRequestByIdQuery: jest.fn(),
  processApprovalQuery: jest.fn(),
  withdrawApprovalRequestQuery: jest.fn(),
}));

jest.mock("../../utils/approvalWorkflow.utils", () => ({
  getApprovalWorkflowByIdQuery: jest.fn(),
  getWorkflowStepsQuery: jest.fn(),
}));

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({
      commit: jest.fn<any>().mockResolvedValue(undefined),
      rollback: jest.fn<any>().mockResolvedValue(undefined),
    }),
    query: jest.fn<any>().mockResolvedValue([{ name: "John", surname: "Doe" }]),
  },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  logStructured: jest.fn(),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    202: (data: any) => ({ message: "Accepted", data }),
    204: (data: any) => ({ message: "No Content", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    401: (data: any) => ({ message: "Unauthorized", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    409: (data: any) => ({ message: "Conflict", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
    503: (data: any) => ({ message: "Service Unavailable", data }),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

jest.mock("../../services/inAppNotification.service", () => ({
  notifyApprovalRequested: jest.fn<any>().mockResolvedValue(undefined),
  notifyApprovalComplete: jest.fn<any>().mockResolvedValue(undefined),
  sendInAppNotification: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../services/notification.service", () => ({
  notifyRequesterStepCompleted: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../advisor/approval/approvalGateway", () => ({
  TransientApprovalError: class TransientApprovalError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TransientApprovalError";
    }
  },
}));

jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
}));

// Mock BullMQ Queue to prevent Redis connection attempts
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  })),
}));

import { TransientApprovalError } from "../../advisor/approval/approvalGateway";
import { sequelize } from "../../database/db";
import {
  createApprovalRequestQuery,
  getApprovalRequestByIdQuery,
  getMyApprovalRequestsQuery,
  getPendingApprovalsQuery,
  processApprovalQuery,
  withdrawApprovalRequestQuery,
} from "../../utils/approvalRequest.utils";
import {
  getApprovalWorkflowByIdQuery,
  getWorkflowStepsQuery,
} from "../../utils/approvalWorkflow.utils";
import {
  approveRequest,
  createApprovalRequest,
  getAllApprovalRequests,
  getApprovalRequestById,
  getMyApprovalRequests,
  getPendingApprovals,
  rejectRequest,
  withdrawRequest,
} from "../approvalRequest.ctrl";

const mockCreateApprovalRequestQuery = createApprovalRequestQuery as jest.MockedFunction<
  typeof createApprovalRequestQuery
>;
const mockGetMyApprovalRequestsQuery = getMyApprovalRequestsQuery as jest.MockedFunction<
  typeof getMyApprovalRequestsQuery
>;
const mockGetPendingApprovalsQuery = getPendingApprovalsQuery as jest.MockedFunction<
  typeof getPendingApprovalsQuery
>;
const mockGetApprovalRequestByIdQuery = getApprovalRequestByIdQuery as jest.MockedFunction<
  typeof getApprovalRequestByIdQuery
>;
const mockProcessApprovalQuery = processApprovalQuery as jest.MockedFunction<
  typeof processApprovalQuery
>;
const mockWithdrawApprovalRequestQuery = withdrawApprovalRequestQuery as jest.MockedFunction<
  typeof withdrawApprovalRequestQuery
>;
const mockGetApprovalWorkflowByIdQuery = getApprovalWorkflowByIdQuery as jest.MockedFunction<
  typeof getApprovalWorkflowByIdQuery
>;
const mockGetWorkflowStepsQuery = getWorkflowStepsQuery as jest.MockedFunction<
  typeof getWorkflowStepsQuery
>;

function createReq(overrides?: any): any {
  return {
    userId: 1,
    organizationId: 1,
    body: {},
    params: {},
    t: (key: string) => key,
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("approvalRequest.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    // Wait for any pending async operations to complete
    await new Promise((resolve) => setImmediate(resolve));
  });

  describe("createApprovalRequest", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 when organizationId is missing", async () => {
      const req = createReq({ organizationId: undefined });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when request_name is missing", async () => {
      const req = createReq({ body: { workflow_id: 1 } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when workflow_id is missing", async () => {
      const req = createReq({ body: { request_name: "Test Request" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when workflow is not found", async () => {
      const req = createReq({
        body: { request_name: "Test Request", workflow_id: 1 },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockGetApprovalWorkflowByIdQuery.mockResolvedValue(null as any);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 when workflow has no steps", async () => {
      const req = createReq({
        body: { request_name: "Test Request", workflow_id: 1 },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockGetApprovalWorkflowByIdQuery.mockResolvedValue({
        id: 1,
        workflow_title: "Test Workflow",
      } as any);
      mockGetWorkflowStepsQuery.mockResolvedValue([] as any);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 when approval request is created successfully", async () => {
      const mockWorkflow = {
        id: 1,
        workflow_title: "Test Workflow",
      };
      const mockSteps = [
        {
          step_number: 1,
          approvers: [{ approver_id: 2 }],
        },
      ];
      const mockRequest = {
        id: 1,
        request_name: "Test Request",
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          request_name: "Test Request",
        }),
      };

      const req = createReq({
        body: {
          request_name: "Test Request",
          workflow_id: 1,
          entity_id: "entity1",
          entity_type: "use_case",
          entity_data: {},
        },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockGetApprovalWorkflowByIdQuery.mockResolvedValue(mockWorkflow as any);
      mockGetWorkflowStepsQuery.mockResolvedValue(mockSteps as any);
      mockCreateApprovalRequestQuery.mockResolvedValue(mockRequest as any);

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCreateApprovalRequestQuery).toHaveBeenCalled();
    });

    it("should return 500 on database error", async () => {
      const req = createReq({
        body: { request_name: "Test Request", workflow_id: 1 },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockGetApprovalWorkflowByIdQuery.mockRejectedValue(new Error("Database error"));

      await createApprovalRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getMyApprovalRequests", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined });
      const res = createRes();

      await getMyApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 when organizationId is missing", async () => {
      const req = createReq({ organizationId: undefined });
      const res = createRes();

      await getMyApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 200 with approval requests", async () => {
      const mockRequests = [
        { id: 1, request_name: "Request 1" },
        { id: 2, request_name: "Request 2" },
      ];
      mockGetMyApprovalRequestsQuery.mockResolvedValue(mockRequests as any);

      const req = createReq();
      const res = createRes();

      await getMyApprovalRequests(req as Request, res as Response);

      expect(mockGetMyApprovalRequestsQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockRequests,
      });
    });

    it("should return 200 with empty array when no requests exist", async () => {
      mockGetMyApprovalRequestsQuery.mockResolvedValue([] as any);

      const req = createReq();
      const res = createRes();

      await getMyApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: [],
      });
    });

    it("should return 500 on error", async () => {
      mockGetMyApprovalRequestsQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq();
      const res = createRes();

      await getMyApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getPendingApprovals", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined });
      const res = createRes();

      await getPendingApprovals(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 when organizationId is missing", async () => {
      const req = createReq({ organizationId: undefined });
      const res = createRes();

      await getPendingApprovals(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 200 with pending approvals", async () => {
      const mockApprovals = [{ id: 1, request_name: "Pending Request 1", status: "Pending" }];
      mockGetPendingApprovalsQuery.mockResolvedValue(mockApprovals as any);

      const req = createReq();
      const res = createRes();

      await getPendingApprovals(req as Request, res as Response);

      expect(mockGetPendingApprovalsQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockApprovals,
      });
    });

    it("should return 500 on error", async () => {
      mockGetPendingApprovalsQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq();
      const res = createRes();

      await getPendingApprovals(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getApprovalRequestById", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined, params: { id: "1" } });
      const res = createRes();

      await getApprovalRequestById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when id is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      await getApprovalRequestById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when request is not found", async () => {
      mockGetApprovalRequestByIdQuery.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();

      await getApprovalRequestById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 when request is found", async () => {
      const mockRequest = {
        id: 1,
        request_name: "Test Request",
        status: "Pending",
      };
      mockGetApprovalRequestByIdQuery.mockResolvedValue(mockRequest as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getApprovalRequestById(req as Request, res as Response);

      expect(mockGetApprovalRequestByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockRequest,
      });
    });

    it("should return 500 on error", async () => {
      mockGetApprovalRequestByIdQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getApprovalRequestById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array id parameter", async () => {
      const mockRequest = {
        id: 1,
        request_name: "Test Request",
      };
      mockGetApprovalRequestByIdQuery.mockResolvedValue(mockRequest as any);

      const req = createReq({ params: { id: ["1"] } });
      const res = createRes();

      await getApprovalRequestById(req as Request, res as Response);

      expect(mockGetApprovalRequestByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("approveRequest", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined, params: { id: "1" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await approveRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when id is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await approveRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 when approval is successful", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { comments: "Approved" },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockProcessApprovalQuery.mockResolvedValue({
        type: "step_approvers",
        stepNumber: 1,
        requestName: "Test Request",
        requesterId: 1,
        completedStep: 1,
      } as any);

      await approveRequest(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockProcessApprovalQuery).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { message: "Request approved successfully" },
      });
    });

    it("should return 409 on TransientApprovalError", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { comments: "Approved" },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockProcessApprovalQuery.mockRejectedValue(new TransientApprovalError("Transient error"));

      await approveRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 500 on error", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { comments: "Approved" },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockProcessApprovalQuery.mockRejectedValue(new Error("Database error"));

      await approveRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array id parameter", async () => {
      const req = createReq({
        params: { id: ["1"] },
        body: { comments: "Approved" },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockProcessApprovalQuery.mockResolvedValue({
        type: "step_approvers",
        stepNumber: 1,
        requestName: "Test Request",
      } as any);

      await approveRequest(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("rejectRequest", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined, params: { id: "1" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await rejectRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when id is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await rejectRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 when rejection is successful", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { comments: "Rejected" },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockProcessApprovalQuery.mockResolvedValue({
        type: "requester_rejected",
        requestName: "Test Request",
        requesterId: 1,
      } as any);

      await rejectRequest(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { message: "Request rejected successfully" },
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { comments: "Rejected" },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockProcessApprovalQuery.mockRejectedValue(new Error("Database error"));

      await rejectRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("withdrawRequest", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined, params: { id: "1" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when id is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 403 when user is not the requestor", async () => {
      const mockRequest = {
        id: 1,
        requested_by: 2, // Different user
      };
      mockGetApprovalRequestByIdQuery.mockResolvedValue(mockRequest as any);

      const req = createReq({ params: { id: "1" }, userId: 1 });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when request is not found", async () => {
      mockGetApprovalRequestByIdQuery.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 200 when withdrawal is successful", async () => {
      const mockRequest = {
        id: 1,
        requested_by: 1, // Same user
      };
      mockGetApprovalRequestByIdQuery.mockResolvedValue(mockRequest as any);
      mockWithdrawApprovalRequestQuery.mockResolvedValue(undefined as any);

      const req = createReq({ params: { id: "1" }, userId: 1 });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockWithdrawApprovalRequestQuery).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { message: "Request withdrawn successfully" },
      });
    });

    it("should return 500 on error", async () => {
      mockGetApprovalRequestByIdQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array id parameter", async () => {
      const mockRequest = {
        id: 1,
        requested_by: 1,
      };
      mockGetApprovalRequestByIdQuery.mockResolvedValue(mockRequest as any);
      mockWithdrawApprovalRequestQuery.mockResolvedValue(undefined as any);

      const req = createReq({ params: { id: ["1"] }, userId: 1 });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await withdrawRequest(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("getAllApprovalRequests", () => {
    it("should return 401 when organizationId is missing", async () => {
      const req = createReq({ organizationId: undefined });
      const res = createRes();

      await getAllApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 200 with all approval requests", async () => {
      const mockRequests = [
        { id: 1, request_name: "Request 1", created_at: "2024-01-01" },
        { id: 2, request_name: "Request 2", created_at: "2024-01-02" },
      ];
      (sequelize.query as any).mockResolvedValue(mockRequests as any);

      const req = createReq();
      const res = createRes();

      await getAllApprovalRequests(req as Request, res as Response);

      expect(sequelize.query).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockRequests,
      });
    });

    it("should return 200 with empty array when no requests exist", async () => {
      (sequelize.query as any).mockResolvedValue([]);

      const req = createReq();
      const res = createRes();

      await getAllApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      (sequelize.query as any).mockRejectedValue(new Error("Database error"));

      const req = createReq();
      const res = createRes();

      await getAllApprovalRequests(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
