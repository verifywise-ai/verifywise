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
    409: (d: any) => ({ message: "Conflict", data: d }),
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
  persistTaskEntityLinks: jest.fn().mockResolvedValue(0),
  isValidEntityType: jest.fn((type: string) => ["vendor", "policy", "incident"].includes(type)),
  ArchivedIncidentLinkError: class ArchivedIncidentLinkError extends Error {},
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

import { buildTask } from "../../tests/factories/task.factory";
import {
  createTask,
  getAllTasks,
  getTasksLinkedToEntity,
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
import {
  ArchivedIncidentLinkError,
  persistTaskEntityLinks,
} from "../../utils/taskEntityLink.utils";
import { sequelize } from "../../database/db";

const mockPersistLinks = persistTaskEntityLinks as jest.MockedFunction<
  typeof persistTaskEntityLinks
>;

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
      const task = mockTask(buildTask());
      mockCreate.mockResolvedValue(task as any);
      const req = createReq({ body: { title: "T1", description: "", assignees: [] } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return the full created task entity in the response body", async () => {
      const fullTask = {
        id: 1,
        title: "T1",
        description: "desc",
        creator_id: 1,
        organization_id: 1,
        due_date: "2026-09-01T00:00:00.000Z",
        priority: "High",
        status: "Open",
        categories: ["a"],
        created_at: "2026-08-14T00:00:00.000Z",
        updated_at: "2026-08-14T00:00:00.000Z",
      };
      const task = {
        ...mockTask(fullTask),
        dataValues: { ...fullTask, assignees: [2, 3] },
      };
      mockCreate.mockResolvedValue(task as any);
      const req = createReq({ body: { title: "T1", assignees: [2, 3] } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Created",
        data: expect.objectContaining({
          id: 1,
          title: "T1",
          description: "desc",
          creator_id: 1,
          priority: "High",
          status: "Open",
          created_at: "2026-08-14T00:00:00.000Z",
          assignees: [2, 3],
        }),
      });
    });
    it("should return 500 on error", async () => {
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { title: "T1" } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should persist entity_links when provided", async () => {
      const task = mockTask(buildTask({ id: 5 }));
      mockCreate.mockResolvedValue(task as any);
      const links = [{ entity_id: 9, entity_type: "policy", entity_name: "P" }];
      const req = createReq({ body: { title: "T1", assignees: [], entity_links: links } });
      const res = createRes();
      await createTask(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockPersistLinks).toHaveBeenCalledWith(
        5,
        links,
        { userId: 1, role: "Admin" },
        1,
        expect.anything(),
      );
    });
    it("answers 409 and rolls back when a new link is to an archived incident", async () => {
      mockCreate.mockResolvedValue(mockTask(buildTask({ id: 5 })) as any);
      mockPersistLinks.mockRejectedValueOnce(new ArchivedIncidentLinkError());
      const res = createRes();
      await createTask(
        createReq({
          body: { title: "T1", entity_links: [{ entity_id: 12, entity_type: "incident" }] },
        }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].data).toBe(
        "Restore this incident before linking it to a task.",
      );
      const transaction = await (sequelize.transaction as any).mock.results.at(-1).value;
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    });
    it("should not persist entity_links when none are provided", async () => {
      const task = mockTask(buildTask());
      mockCreate.mockResolvedValue(task as any);
      const req = createReq({ body: { title: "T1", assignees: [] } });
      const res = createRes();
      await createTask(req, res);
      expect(mockPersistLinks).not.toHaveBeenCalled();
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
      const tasks = [mockTask(buildTask())];
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
    // The sidebar's open-task count and the /tasks page send page and
    // page_size (default 25) and rely on getting every matching task back,
    // so the response is always one page holding every match.
    it.each([25, 30])(
      "returns all %i matching tasks as one page, whatever page_size asks",
      async (count) => {
        const tasks = Array.from({ length: count }, (_, i) => mockTask(buildTask({ id: i + 1 })));
        mockGetAll.mockResolvedValue(tasks as any);
        const req = createReq({
          organizationId: 7,
          role: "Editor",
          userId: 3,
          query: { status: "Open", page: "2", page_size: "25" },
        } as any);
        const res = createRes();
        await getAllTasks(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        // Same organization and visibility as the list; no limit/offset.
        expect(mockGetAll).toHaveBeenCalledWith(
          { userId: 3, role: "Editor" },
          7,
          expect.objectContaining({ status: ["Open"], organization_id: 7 }),
          expect.anything(),
        );
        expect(mockGetAll.mock.calls[0]).toHaveLength(4);
        const { tasks: returned, pagination } = res.json.mock.calls[0][0].data;
        expect(returned).toHaveLength(count);
        expect(pagination).toEqual({
          page: 1,
          pageSize: count,
          total: count,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        });
      },
    );
    it("legacy GET /tasks ignores linked_entity parameters (contract unchanged)", async () => {
      mockGetAll.mockResolvedValue([] as any);
      const res = createRes();
      await getAllTasks(
        createReq({ query: { linked_entity_type: "spaceship", linked_entity_id: "x" } } as any),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect((mockGetAll.mock.calls[0][2] as any).linked_entity).toBeUndefined();
    });
    it("reports an empty list as zero pages", async () => {
      mockGetAll.mockResolvedValue([] as any);
      const res = createRes();
      await getAllTasks(createReq(), res);
      expect(res.json.mock.calls[0][0].data.pagination).toEqual({
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });
  });

  describe("getTasksLinkedToEntity (GET /api/v1/tasks/linked/:entityType/:entityId)", () => {
    it("lists the tasks linked to the entity with the caller's visibility", async () => {
      mockGetAll.mockResolvedValue([mockTask(buildTask({ id: 700 }))] as any);
      const res = createRes();
      await getTasksLinkedToEntity(
        createReq({
          userId: 3,
          role: "Editor",
          organizationId: 7,
          params: { entityType: "incident", entityId: "12" },
        } as any),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetAll).toHaveBeenCalledWith({ userId: 3, role: "Editor" }, 7, {
        organization_id: 7,
        linked_entity: { entity_type: "incident", entity_id: 12 },
      });
      const body = res.json.mock.calls[0][0].data;
      expect(body.map((t: any) => t.id)).toEqual([700]);
    });
    it("leaves archived tasks out (no include_archived)", async () => {
      mockGetAll.mockResolvedValue([] as any);
      await getTasksLinkedToEntity(
        createReq({ params: { entityType: "incident", entityId: "12" } } as any),
        createRes(),
      );
      expect((mockGetAll.mock.calls[0][2] as any).include_archived).toBeUndefined();
    });
    it("answers 401 without a user", async () => {
      const res = createRes();
      await getTasksLinkedToEntity(
        createReq({ userId: undefined, params: { entityType: "incident", entityId: "12" } } as any),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockGetAll).not.toHaveBeenCalled();
    });
    it.each([
      ["spaceship", "12"],
      ["incident", "0"],
      ["incident", "-3"],
      ["incident", "12abc"],
      ["incident", "99999999999999999999"],
    ])("answers 400 for type %s and id %s", async (entityType, entityId) => {
      const res = createRes();
      await getTasksLinkedToEntity(createReq({ params: { entityType, entityId } } as any), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGetAll).not.toHaveBeenCalled();
    });
    it("answers 500 when the read fails", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const res = createRes();
      await getTasksLinkedToEntity(
        createReq({ params: { entityType: "incident", entityId: "12" } } as any),
        res,
      );
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
      const task = mockTask(buildTask());
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
      const existing = mockTask(buildTask());
      const updated = mockTask(buildTask({ title: "T2" }));
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const req = createReq({ params: { id: "1" }, body: { title: "T2" } });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return the full updated task entity in the response body", async () => {
      const existing = mockTask(buildTask());
      const fullUpdated = {
        id: 1,
        title: "T2",
        description: "desc",
        creator_id: 1,
        organization_id: 1,
        due_date: "2026-09-01T00:00:00.000Z",
        priority: "High",
        status: "In Progress",
        categories: ["a"],
        created_at: "2026-08-14T00:00:00.000Z",
        updated_at: "2026-08-14T01:00:00.000Z",
      };
      const updated = {
        ...mockTask(fullUpdated),
        dataValues: { ...fullUpdated, assignees: [2] },
      };
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const req = createReq({
        params: { id: "1" },
        body: { title: "T2", status: "In Progress", assignees: [2] },
      });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({
          id: 1,
          title: "T2",
          status: "In Progress",
          priority: "High",
          updated_at: "2026-08-14T01:00:00.000Z",
          assignees: [2],
        }),
      });
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { title: "T2" } });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should persist entity_links when provided", async () => {
      const existing = mockTask(buildTask());
      const updated = mockTask(buildTask({ id: 7 }));
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const links = [{ entity_id: 3, entity_type: "vendor", entity_name: "V" }];
      const req = createReq({
        params: { id: "7" },
        body: { title: "T2", entity_links: links },
      });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPersistLinks).toHaveBeenCalledWith(
        7,
        links,
        { userId: 1, role: "Admin" },
        1,
        expect.anything(),
      );
    });
    it("answers 409 when an update adds a link to an archived incident", async () => {
      mockGetById.mockResolvedValue(mockTask(buildTask()) as any);
      mockUpdate.mockResolvedValue(mockTask(buildTask({ id: 7 })) as any);
      mockPersistLinks.mockRejectedValueOnce(new ArchivedIncidentLinkError());
      const res = createRes();
      await updateTask(
        createReq({
          params: { id: "7" },
          body: { title: "T2", entity_links: [{ entity_id: 12, entity_type: "incident" }] },
        }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].data).toBe(
        "Restore this incident before linking it to a task.",
      );
    });
    it("should not persist entity_links when none are provided", async () => {
      const existing = mockTask(buildTask());
      const updated = mockTask(buildTask({ id: 7 }));
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const req = createReq({ params: { id: "7" }, body: { title: "T2" } });
      const res = createRes();
      await updateTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPersistLinks).not.toHaveBeenCalled();
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
      mockRestore.mockResolvedValue(buildTask() as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await restoreTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return the full restored task entity in the response body", async () => {
      const restored = {
        ...buildTask(),
        description: "desc",
        creator_id: 1,
        organization_id: 1,
        priority: "Medium",
        status: "Open",
        categories: [],
        created_at: "2026-08-14T00:00:00.000Z",
        updated_at: "2026-08-14T01:00:00.000Z",
        assignees: [2],
      };
      mockRestore.mockResolvedValue(restored as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await restoreTask(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({
          id: 1,
          title: "T1",
          status: "Open",
          assignees: [2],
        }),
      });
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
