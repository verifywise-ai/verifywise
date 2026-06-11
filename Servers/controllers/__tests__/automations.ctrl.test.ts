import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/automation.utils", () => ({
  createAutomationQuery: jest.fn(),
  deleteAutomationByIdQuery: jest.fn(),
  getAllAutomationActionsByTriggerIdQuery: jest.fn(),
  getAllAutomationsQuery: jest.fn(),
  getAllAutomationTriggersQuery: jest.fn(),
  getAutomationByIdQuery: jest.fn(),
  updateAutomationByIdQuery: jest.fn(),
}));

jest.mock("../../utils/automationExecutionLog.utils", () => ({
  getAutomationExecutionLogs: jest.fn(),
  getAutomationExecutionStats: jest.fn(),
}));

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({
      commit: jest.fn<any>().mockResolvedValue(undefined),
      rollback: jest.fn<any>().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  })),
}));

import { sequelize } from "../../database/db";
import {
  createAutomationQuery,
  deleteAutomationByIdQuery,
  getAllAutomationActionsByTriggerIdQuery,
  getAllAutomationsQuery,
  getAllAutomationTriggersQuery,
  getAutomationByIdQuery,
  updateAutomationByIdQuery,
} from "../../utils/automation.utils";
import {
  getAutomationExecutionLogs,
  getAutomationExecutionStats,
} from "../../utils/automationExecutionLog.utils";
import {
  createAutomation,
  deleteAutomationById,
  getAllAutomationActionsByTriggerId,
  getAllAutomations,
  getAllAutomationTriggers,
  getAutomationById,
  getAutomationHistory,
  getAutomationStats,
  updateAutomation,
} from "../automations.ctrl";

const mockCreateAutomationQuery = createAutomationQuery as jest.MockedFunction<
  typeof createAutomationQuery
>;
const mockDeleteAutomationByIdQuery = deleteAutomationByIdQuery as jest.MockedFunction<
  typeof deleteAutomationByIdQuery
>;
const mockGetAllAutomationActionsByTriggerIdQuery =
  getAllAutomationActionsByTriggerIdQuery as jest.MockedFunction<
    typeof getAllAutomationActionsByTriggerIdQuery
  >;
const mockGetAllAutomationsQuery = getAllAutomationsQuery as jest.MockedFunction<
  typeof getAllAutomationsQuery
>;
const mockGetAllAutomationTriggersQuery = getAllAutomationTriggersQuery as jest.MockedFunction<
  typeof getAllAutomationTriggersQuery
>;
const mockGetAutomationByIdQuery = getAutomationByIdQuery as jest.MockedFunction<
  typeof getAutomationByIdQuery
>;
const mockUpdateAutomationByIdQuery = updateAutomationByIdQuery as jest.MockedFunction<
  typeof updateAutomationByIdQuery
>;
const mockGetAutomationExecutionLogs = getAutomationExecutionLogs as jest.MockedFunction<
  typeof getAutomationExecutionLogs
>;
const mockGetAutomationExecutionStats = getAutomationExecutionStats as jest.MockedFunction<
  typeof getAutomationExecutionStats
>;

function createReq(overrides?: any): any {
  return {
    organizationId: 1,
    userId: 1,
    body: {},
    params: {},
    query: {},
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

describe("automations.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    await new Promise((resolve) => setImmediate(resolve));
  });

  describe("getAllAutomationTriggers", () => {
    it("should return 200 with triggers", async () => {
      const mockTriggers = [
        { id: 1, name: "Trigger 1" },
        { id: 2, name: "Trigger 2" },
      ];
      mockGetAllAutomationTriggersQuery.mockResolvedValue(mockTriggers as any);

      const req = createReq();
      const res = createRes();

      await getAllAutomationTriggers(req as Request, res as Response);

      expect(mockGetAllAutomationTriggersQuery).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockTriggers,
      });
    });

    it("should return 500 on error", async () => {
      mockGetAllAutomationTriggersQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq();
      const res = createRes();

      await getAllAutomationTriggers(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllAutomationActionsByTriggerId", () => {
    it("should return 400 when trigger ID is invalid", async () => {
      const req = createReq({ params: { triggerId: "invalid" } });
      const res = createRes();

      await getAllAutomationActionsByTriggerId(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with actions", async () => {
      const mockActions = [
        { id: 1, name: "Action 1" },
        { id: 2, name: "Action 2" },
      ];
      mockGetAllAutomationActionsByTriggerIdQuery.mockResolvedValue(mockActions as any);

      const req = createReq({ params: { triggerId: "1" } });
      const res = createRes();

      await getAllAutomationActionsByTriggerId(req as Request, res as Response);

      expect(mockGetAllAutomationActionsByTriggerIdQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockActions,
      });
    });

    it("should return 500 on error", async () => {
      mockGetAllAutomationActionsByTriggerIdQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { triggerId: "1" } });
      const res = createRes();

      await getAllAutomationActionsByTriggerId(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array triggerId parameter", async () => {
      const mockActions = [{ id: 1, name: "Action 1" }];
      mockGetAllAutomationActionsByTriggerIdQuery.mockResolvedValue(mockActions as any);

      const req = createReq({ params: { triggerId: ["1"] } });
      const res = createRes();

      await getAllAutomationActionsByTriggerId(req as Request, res as Response);

      expect(mockGetAllAutomationActionsByTriggerIdQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("getAllAutomations", () => {
    it("should return 200 with automations", async () => {
      const mockAutomations = [
        { id: 1, name: "Automation 1" },
        { id: 2, name: "Automation 2" },
      ];
      mockGetAllAutomationsQuery.mockResolvedValue(mockAutomations as any);

      const req = createReq();
      const res = createRes();

      await getAllAutomations(req as Request, res as Response);

      expect(mockGetAllAutomationsQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockAutomations,
      });
    });

    it("should return 500 on error", async () => {
      mockGetAllAutomationsQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq();
      const res = createRes();

      await getAllAutomations(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAutomationById", () => {
    it("should return 400 when ID is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      await getAutomationById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when automation not found", async () => {
      mockGetAutomationByIdQuery.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();

      await getAutomationById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 when automation is found", async () => {
      const mockAutomation = { id: 1, name: "Test Automation" };
      mockGetAutomationByIdQuery.mockResolvedValue(mockAutomation as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAutomationById(req as Request, res as Response);

      expect(mockGetAutomationByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockAutomation,
      });
    });

    it("should return 500 on error", async () => {
      mockGetAutomationByIdQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAutomationById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array ID parameter", async () => {
      const mockAutomation = { id: 1, name: "Test Automation" };
      mockGetAutomationByIdQuery.mockResolvedValue(mockAutomation as any);

      const req = createReq({ params: { id: ["1"] } });
      const res = createRes();

      await getAutomationById(req as Request, res as Response);

      expect(mockGetAutomationByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("createAutomation", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createAutomation(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when actions array is empty", async () => {
      const req = createReq({
        body: { triggerId: 1, name: "Test", actions: [] },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createAutomation(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 when automation is created successfully", async () => {
      const mockAutomation = { id: 1, name: "Test Automation" };
      mockCreateAutomationQuery.mockResolvedValue(mockAutomation as any);

      const req = createReq({
        body: {
          triggerId: 1,
          name: "Test Automation",
          actions: [{ action_type_id: 1 }],
          params: "{}",
        },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await createAutomation(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Created",
        data: mockAutomation,
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq({
        body: {
          triggerId: 1,
          name: "Test",
          actions: [{ action_type_id: 1 }],
        },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockCreateAutomationQuery.mockRejectedValue(new Error("Database error"));

      await createAutomation(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateAutomation", () => {
    it("should return 400 when ID is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      await updateAutomation(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 when automation is updated successfully", async () => {
      const mockAutomation = { id: 1, name: "Updated Automation" };
      mockUpdateAutomationByIdQuery.mockResolvedValue(mockAutomation as any);

      const req = createReq({
        params: { id: "1" },
        body: {
          name: "Updated",
          is_active: true,
          triggerId: 1,
          params: "{}",
          actions: [{ action_type_id: 1 }],
        },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await updateAutomation(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockAutomation,
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated", actions: [{ action_type_id: 1 }] },
      });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockUpdateAutomationByIdQuery.mockRejectedValue(new Error("Database error"));

      await updateAutomation(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteAutomationById", () => {
    it("should return 400 when ID is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      await deleteAutomationById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when automation not found", async () => {
      mockDeleteAutomationByIdQuery.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await deleteAutomationById(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 when automation is deleted successfully", async () => {
      mockDeleteAutomationByIdQuery.mockResolvedValue({ id: 1 } as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await deleteAutomationById(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { message: "Automation deleted successfully" },
      });
    });

    it("should return 500 on error", async () => {
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);
      mockDeleteAutomationByIdQuery.mockRejectedValue(new Error("Database error"));

      await deleteAutomationById(req as Request, res as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array ID parameter", async () => {
      mockDeleteAutomationByIdQuery.mockResolvedValue({ id: 1 } as any);

      const req = createReq({ params: { id: ["1"] } });
      const res = createRes();

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      (sequelize.transaction as any).mockResolvedValue(mockTransaction);

      await deleteAutomationById(req as Request, res as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("getAutomationHistory", () => {
    it("should return 400 when ID is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      await getAutomationHistory(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with execution logs", async () => {
      const mockLogs = {
        logs: [{ id: 1, status: "success", action_results: [] }],
        total: 1,
      };
      mockGetAutomationExecutionLogs.mockResolvedValue(mockLogs as any);

      const req = createReq({
        params: { id: "1" },
        query: { limit: "50", offset: "0" },
      });
      const res = createRes();

      await getAutomationHistory(req as Request, res as Response);

      expect(mockGetAutomationExecutionLogs).toHaveBeenCalledWith(1, 50, 0, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: {
          logs: [{ id: 1, status: "success", action_results: [], actions: [] }],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
    });

    it("should use default limit and offset when not provided", async () => {
      const mockLogs = { logs: [], total: 0 };
      mockGetAutomationExecutionLogs.mockResolvedValue(mockLogs as any);

      const req = createReq({ params: { id: "1" }, query: {} });
      const res = createRes();

      await getAutomationHistory(req as Request, res as Response);

      expect(mockGetAutomationExecutionLogs).toHaveBeenCalledWith(1, 50, 0, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetAutomationExecutionLogs.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAutomationHistory(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAutomationStats", () => {
    it("should return 400 when ID is invalid", async () => {
      const req = createReq({ params: { id: "invalid" } });
      const res = createRes();

      await getAutomationStats(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with stats", async () => {
      const mockStats = {
        total_executions: 10,
        successful: 8,
        failed: 2,
      };
      mockGetAutomationExecutionStats.mockResolvedValue(mockStats as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAutomationStats(req as Request, res as Response);

      expect(mockGetAutomationExecutionStats).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockStats,
      });
    });

    it("should return 500 on error", async () => {
      mockGetAutomationExecutionStats.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAutomationStats(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should handle array ID parameter", async () => {
      const mockStats = { total_executions: 5 };
      mockGetAutomationExecutionStats.mockResolvedValue(mockStats as any);

      const req = createReq({ params: { id: ["1"] } });
      const res = createRes();

      await getAutomationStats(req as Request, res as Response);

      expect(mockGetAutomationExecutionStats).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
