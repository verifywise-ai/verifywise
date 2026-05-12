import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/task.utils", () => ({
  bulkMarkTasksCompleteQuery: jest.fn<any>().mockResolvedValue(undefined),
  bulkSetTasksCategoriesQuery: jest.fn<any>().mockResolvedValue(undefined),
  // Other exports the controller imports — provided as noop mocks so the
  // module loads without side effects.
  createNewTaskQuery: jest.fn(),
  getTasksQuery: jest.fn(),
  getTaskByIdQuery: jest.fn(),
  updateTaskByIdQuery: jest.fn(),
  deleteTaskByIdQuery: jest.fn(),
  restoreTaskByIdQuery: jest.fn(),
  hardDeleteTaskByIdQuery: jest.fn(),
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

import { bulkUpdateTasks } from "../task.ctrl";
import { bulkMarkTasksCompleteQuery, bulkSetTasksCategoriesQuery } from "../../utils/task.utils";
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
const mockMarkComplete = bulkMarkTasksCompleteQuery as jest.MockedFunction<
  typeof bulkMarkTasksCompleteQuery
>;
const mockSetCategories = bulkSetTasksCategoriesQuery as jest.MockedFunction<
  typeof bulkSetTasksCategoriesQuery
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

describe("bulkUpdateTasks", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: parseBulkIds returns whatever ids array is passed in
    mockParseBulkIds.mockImplementation((input: any) => {
      if (!Array.isArray(input) || input.length === 0) {
        throw new ValidationException("ids must be a non-empty array", "ids", input);
      }
      return input.map((n: any) => Number(n));
    });

    // Default: withBulkTransaction invokes the handler and returns its result
    mockWithBulkTransaction.mockImplementation(async (_options: any, handler: any) => {
      return handler({} as any);
    });
  });

  it("returns 200 and runs the mark_complete query for a happy-path call", async () => {
    const req = createReq({ ids: [1, 2, 3], action: "mark_complete" });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(mockAssertOrgOwnsIds).toHaveBeenCalledWith(
      expect.objectContaining({ table: "tasks", ids: [1, 2, 3], organizationId: 4 }),
    );
    expect(mockMarkComplete).toHaveBeenCalledWith(4, [1, 2, 3], expect.anything());
    expect(mockSetCategories).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { updated: 3, action: "mark_complete" },
    });
  });

  it("returns 200 and runs the set_categories query when categories are valid", async () => {
    const req = createReq({
      ids: [10, 11],
      action: "set_categories",
      categories: ["audit", "GDPR"],
    });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(mockSetCategories).toHaveBeenCalledWith(
      4,
      [10, 11],
      ["audit", "GDPR"],
      expect.anything(),
    );
    expect(mockMarkComplete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when the action is unknown", async () => {
    const req = createReq({ ids: [1], action: "explode" });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithBulkTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when set_categories receives non-array categories", async () => {
    const req = createReq({
      ids: [1],
      action: "set_categories",
      categories: "audit",
    });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetCategories).not.toHaveBeenCalled();
  });

  it("returns 400 when set_categories receives an empty string in the array", async () => {
    const req = createReq({
      ids: [1],
      action: "set_categories",
      categories: [""],
    });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when set_categories receives more than 10 categories", async () => {
    const req = createReq({
      ids: [1],
      action: "set_categories",
      categories: Array.from({ length: 11 }, (_, i) => `cat${i}`),
    });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when ids is empty (parseBulkIds throws ValidationException)", async () => {
    const req = createReq({ ids: [], action: "mark_complete" });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithBulkTransaction).not.toHaveBeenCalled();
  });

  it("returns 403 when the tenant guard rejects (cross-org access)", async () => {
    mockAssertOrgOwnsIds.mockRejectedValueOnce(
      new ForbiddenException("Cross-tenant access", "tasks", "bulk_action"),
    );

    const req = createReq({ ids: [99], action: "mark_complete" });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockMarkComplete).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    mockWithBulkTransaction.mockImplementationOnce(async () => {
      throw new Error("db exploded");
    });

    const req = createReq({ ids: [1, 2], action: "mark_complete" });
    const res = createRes();

    await bulkUpdateTasks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
