import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const mockCommit = jest.fn();
const mockRollback = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock("../logger/logHelper", () => ({
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { logSuccess, logFailure } from "../logger/logHelper";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../bulkAction.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<typeof sequelize.transaction>;
const mockLogSuccess = logSuccess as jest.MockedFunction<typeof logSuccess>;
const mockLogFailure = logFailure as jest.MockedFunction<typeof logFailure>;

describe("parseBulkIds", () => {
  it("rejects non-array input", () => {
    expect(() => parseBulkIds(undefined)).toThrow(ValidationException);
    expect(() => parseBulkIds("1,2,3")).toThrow(ValidationException);
    expect(() => parseBulkIds({ ids: [1] })).toThrow(ValidationException);
  });

  it("rejects empty arrays", () => {
    expect(() => parseBulkIds([])).toThrow(/must not be empty/);
  });

  it("rejects arrays exceeding the max length", () => {
    const big = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(() => parseBulkIds(big, { max: 10 })).toThrow(/cannot exceed 10/);
  });

  it("rejects non-positive or non-integer ids", () => {
    expect(() => parseBulkIds([0])).toThrow(/positive integers/);
    expect(() => parseBulkIds([-3])).toThrow(/positive integers/);
    expect(() => parseBulkIds([1.5])).toThrow(/positive integers/);
    expect(() => parseBulkIds(["abc"])).toThrow(/positive integers/);
  });

  it("dedupes preserving first-seen order", () => {
    expect(parseBulkIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });

  it("coerces numeric strings to numbers", () => {
    expect(parseBulkIds(["7", 8, "8"])).toEqual([7, 8]);
  });
});

describe("assertOrgOwnsIds", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns immediately when ids is empty without querying", async () => {
    await assertOrgOwnsIds({ table: "tasks", ids: [], organizationId: 1 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects an unsafe table name", async () => {
    await expect(
      assertOrgOwnsIds({
        table: "tasks; DROP TABLE users;",
        ids: [1],
        organizationId: 1,
      }),
    ).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("succeeds when the org owns every id", async () => {
    mockQuery.mockResolvedValueOnce([{ count: "3" }] as any);
    await expect(
      assertOrgOwnsIds({ table: "tasks", ids: [1, 2, 3], organizationId: 4 }),
    ).resolves.toBeUndefined();
  });

  it("throws ForbiddenException when one id is missing or in another org", async () => {
    mockQuery.mockResolvedValueOnce([{ count: "2" }] as any);
    await expect(
      assertOrgOwnsIds({ table: "tasks", ids: [1, 2, 99], organizationId: 4 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("passes organization id and ids as parameters (no inline interpolation)", async () => {
    mockQuery.mockResolvedValueOnce([{ count: "1" }] as any);
    await assertOrgOwnsIds({ table: "tasks", ids: [42], organizationId: 7 });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      replacements: { ids: [42], organizationId: 7 },
    });
  });
});

describe("withBulkTransaction", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockLogSuccess.mockReset();
    mockLogFailure.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockTransaction.mockResolvedValue({
      commit: mockCommit,
      rollback: mockRollback,
    } as any);
  });

  const audit = {
    action: "mark_complete",
    ids: [1, 2],
    fileName: "task.ctrl.ts",
    functionName: "bulkUpdateTasks",
    userId: 9,
    organizationId: 4,
  };

  it("commits and logs success when the handler resolves", async () => {
    const handler = jest.fn(async () => "ok");

    const result = await withBulkTransaction({ audit }, handler as any);

    expect(result).toBe("ok");
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();
    expect(mockLogSuccess).toHaveBeenCalledTimes(1);
    expect(mockLogFailure).not.toHaveBeenCalled();
    const successArgs = mockLogSuccess.mock.calls[0][0] as any;
    expect(successArgs).toMatchObject({
      eventType: "Update",
      functionName: "bulkUpdateTasks",
      organizationId: 4,
    });
    expect(successArgs.description).toContain("mark_complete");
    expect(successArgs.description).toContain("2");
  });

  it("rolls back and logs failure when the handler throws", async () => {
    const error = new Error("boom");
    const handler = jest.fn(async () => {
      throw error;
    });

    await expect(withBulkTransaction({ audit }, handler as any)).rejects.toBe(error);

    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockLogSuccess).not.toHaveBeenCalled();
    expect(mockLogFailure).toHaveBeenCalledTimes(1);
    const failureArgs = mockLogFailure.mock.calls[0][0] as any;
    expect(failureArgs.error).toBe(error);
    expect(failureArgs.description).toContain("mark_complete");
  });

  it("respects an audit eventType override", async () => {
    const handler = jest.fn(async () => undefined);

    await withBulkTransaction({ audit: { ...audit, eventType: "Delete" } }, handler as any);

    const successArgs = mockLogSuccess.mock.calls[0][0] as any;
    expect(successArgs.eventType).toBe("Delete");
  });
});
