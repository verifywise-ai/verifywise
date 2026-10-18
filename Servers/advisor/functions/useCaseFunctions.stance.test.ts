/**
 * agent_delete_use_case deletes through the app's project delete path, which
 * locks the project row first: a stance generated concurrently either commits
 * before the delete (and its PDF is deleted with the project's files) or
 * waits and fails, so no stance PDF outlives its stance.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const order: string[] = [];
const tx = { commit: jest.fn(), rollback: jest.fn() };
const queries: string[] = [];
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => tx),
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return [{ id: 7, project_title: "Hiring screen" }];
    }),
  },
}));
const mockLock = jest.fn<any>();
jest.mock("../../utils/project.utils", () => ({
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: (...args: unknown[]) => {
    order.push("lock");
    return mockLock(...args);
  },
}));
const mockDelete = jest.fn<any>();
jest.mock("../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: (...args: unknown[]) => {
    order.push("delete");
    return mockDelete(...args);
  },
}));
jest.mock("../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../utils/user.utils", () => ({}));

import "./useCaseFunctions";
import { writeToolExecutors } from "../confirmation/createWriteTool";

const run = (params: Record<string, unknown>) =>
  writeToolExecutors.get("agent_delete_use_case")!(params, 1);

describe("agent_delete_use_case", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    queries.length = 0;
    mockDelete.mockResolvedValue({ deleted: true, withdrawnApprovalId: null });
  });

  it("locks the project, then deletes it through the project delete path", async () => {
    mockLock.mockResolvedValue(true);
    const result = await run({ use_case_id: 7, _userId: 3 });

    expect(order).toEqual(["lock", "delete"]);
    expect(mockLock).toHaveBeenCalledWith(7, 1, tx);
    expect(mockDelete).toHaveBeenCalledWith(7, 1, tx, {
      userId: 3,
      alreadyLocked: true,
      enqueueAutomationAfterCommit: true,
    });
    // No hand-written deletes of its own.
    expect(queries.filter((sql) => /\bDELETE\b/i.test(sql))).toEqual([]);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      deleted_use_case: { id: 7, project_title: "Hiring screen" },
    });
  });

  it("touches nothing else for a use case outside the organization", async () => {
    mockLock.mockResolvedValue(false);
    const result = await run({ use_case_id: 7 });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
    expect(result).toEqual({ success: true, deleted_use_case: null });
  });

  it("rolls back when the delete fails", async () => {
    mockLock.mockResolvedValue(true);
    mockDelete.mockRejectedValue(new Error("boom"));
    await expect(run({ use_case_id: 7 })).rejects.toThrow("boom");
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });
});
