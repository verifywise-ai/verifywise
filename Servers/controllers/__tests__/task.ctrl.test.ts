import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/task.utils", () => ({
  createNewTaskQuery: jest.fn(),
  getTasksQuery: jest.fn(),
  getTaskByIdQuery: jest.fn(),
  updateTaskByIdQuery: jest.fn(),
  deleteTaskByIdQuery: jest.fn(),
  restoreTaskByIdQuery: jest.fn(),
  hardDeleteTaskByIdQuery: jest.fn(),
  bulkMarkTasksCompleteQuery: jest.fn(),
  bulkSetTasksCategoriesQuery: jest.fn(),
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
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    401: (d: any) => ({ message: "Unauthorized", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    503: (d: any) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskUpdated: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/taskEntityLink.utils", () => ({
  getTaskEntityLinksQuery: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: jest.fn().mockResolvedValue(undefined),
  trackEntityChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
  recordEntityDeletion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
}));

import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  restoreTask,
  hardDeleteTask,
  bulkUpdateTasks,
} from "../task.ctrl";
import {
  createNewTaskQuery,
  getTasksQuery,
  getTaskByIdQuery,
  updateTaskByIdQuery,
  deleteTaskByIdQuery,
  restoreTaskByIdQuery,
  hardDeleteTaskByIdQuery,
} from "../../utils/task.utils";

const mockCreate = createNewTaskQuery as jest.MockedFunction<typeof createNewTaskQuery>;
const mockGetAll = getTasksQuery as jest.MockedFunction<typeof getTasksQuery>;
const mockGetById = getTaskByIdQuery as jest.MockedFunction<typeof getTaskByIdQuery>;
const mockUpdate = updateTaskByIdQuery as jest.MockedFunction<typeof updateTaskByIdQuery>;
const mockDelete = deleteTaskByIdQuery as jest.MockedFunction<typeof deleteTaskByIdQuery>;
const mockRestore = restoreTaskByIdQuery as jest.MockedFunction<typeof restoreTaskByIdQuery>;
const mockHardDelete = hardDeleteTaskByIdQuery as jest.MockedFunction<
  typeof hardDeleteTaskByIdQuery
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

function mockTask(data: any) {
  return {
    ...data,
    toJSON: () => data,
    dataValues: { assignees: [], entity_links: [], ...data },
  };
}

describe("task.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetById.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockRestore.mockReset();
    mockHardDelete.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  describe("createTask", () => {
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ userId: undefined, body: { title: "T1" } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 201 when task is created", async () => {
      const task = mockTask({ id: 1, title: "T1" });
      mockCreate.mockResolvedValue(task as any);
      const req = createReq({ body: { title: "T1", description: "", assignees: [] } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 500 on error", async () => {
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { title: "T1" } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllTasks", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ userId: undefined, role: undefined });
      const res = createRes();
      await getAllTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 with tasks", async () => {
      const tasks = [mockTask({ id: 1, title: "T1" })];
      mockGetAll.mockResolvedValue(tasks as any);
      const req = createReq();
      const res = createRes();
      await getAllTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getTaskById", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined, role: undefined });
      const res = createRes();
      await getTaskById(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 when task is found", async () => {
      const task = mockTask({ id: 1, title: "T1" });
      mockGetById.mockResolvedValue(task as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getTaskById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when task is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getTaskById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getTaskById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateTask", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { title: "T2" },
        userId: undefined,
        role: undefined,
      });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 when task is updated", async () => {
      const existing = mockTask({ id: 1, title: "T1" });
      const updated = mockTask({ id: 1, title: "T2" });
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const req = createReq({ params: { id: "1" }, body: { title: "T2" } });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { title: "T2" } });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteTask", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined, role: undefined });
      const res = createRes();
      await deleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 when task is deleted", async () => {
      mockDelete.mockResolvedValue(true as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when task is not found", async () => {
      mockDelete.mockResolvedValue(false as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockDelete.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("restoreTask", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined, role: undefined });
      const res = createRes();
      await restoreTask(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 when task is restored", async () => {
      mockRestore.mockResolvedValue({ id: 1, title: "T1" } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await restoreTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when task is not found", async () => {
      mockRestore.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await restoreTask(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockRestore.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await restoreTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("hardDeleteTask", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined, role: undefined });
      const res = createRes();
      await hardDeleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 when task is permanently deleted", async () => {
      mockHardDelete.mockResolvedValue(true as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await hardDeleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when task is not found", async () => {
      mockHardDelete.mockResolvedValue(false as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await hardDeleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockHardDelete.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await hardDeleteTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("bulkUpdateTasks", () => {
    it("should return 200 for mark_complete action", async () => {
      const req = createReq({ body: { ids: [1, 2], action: "mark_complete" } });
      const res = createRes();
      await bulkUpdateTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 200 for set_categories action", async () => {
      const req = createReq({ body: { ids: [1], action: "set_categories", categories: ["a"] } });
      const res = createRes();
      await bulkUpdateTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 400 for invalid action", async () => {
      const req = createReq({ body: { ids: [1], action: "invalid" } });
      const res = createRes();
      await bulkUpdateTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 for invalid categories", async () => {
      const req = createReq({ body: { ids: [1], action: "set_categories", categories: [""] } });
      const res = createRes();
      await bulkUpdateTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 500 on unexpected error", async () => {
      const { parseBulkIds } = require("../../utils/bulkAction.utils");
      (parseBulkIds as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const req = createReq({ body: { ids: [1], action: "mark_complete" } });
      const res = createRes();
      await bulkUpdateTasks(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
