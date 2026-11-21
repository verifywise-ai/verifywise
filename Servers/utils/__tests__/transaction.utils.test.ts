import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockTransaction = jest.fn<() => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { transaction: () => mockTransaction() },
}));
const mockLogRollbackFailure = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../logger/logHelper", () => ({
  logRollbackFailure: (...args: any[]) => mockLogRollbackFailure(...args),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), debug: jest.fn() },
}));

import { inTransaction, TransactionContext } from "../transaction.utils";

const context: TransactionContext = {
  functionName: "deleteModelInventoryService",
  fileName: "modelInventory.service.ts",
  eventType: "Delete",
  organizationId: 4,
  userId: 9,
};

const fakeTx = (rollback: () => Promise<void> = async () => undefined) => ({
  commit: jest.fn(async () => undefined),
  rollback: jest.fn(rollback),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLogRollbackFailure.mockResolvedValue(undefined);
});

describe("inTransaction", () => {
  it("runs in the caller's transaction without committing it", async () => {
    const tx = fakeTx();
    expect(await inTransaction(tx as any, context, async () => 3)).toBe(3);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("commits a transaction it opened", async () => {
    const tx = fakeTx();
    mockTransaction.mockResolvedValue(tx);
    expect(await inTransaction(undefined, context, async () => "ok")).toBe("ok");
    expect(tx.commit).toHaveBeenCalledTimes(1);
  });

  it("rolls back and throws the original error, logging nothing when the rollback works", async () => {
    const tx = fakeTx();
    mockTransaction.mockResolvedValue(tx);
    const original = new Error("write failed");
    await expect(
      inTransaction(undefined, context, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(mockLogRollbackFailure).not.toHaveBeenCalled();
  });

  it("logs a failed rollback through logRollbackFailure with its context", async () => {
    const rollbackError = new Error("connection lost");
    const tx = fakeTx(async () => {
      throw rollbackError;
    });
    mockTransaction.mockResolvedValue(tx);
    const original = new Error("write failed");
    await expect(
      inTransaction(undefined, context, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(mockLogRollbackFailure).toHaveBeenCalledWith({
      functionName: "deleteModelInventoryService",
      fileName: "modelInventory.service.ts",
      eventType: "Delete",
      userId: 9,
      organizationId: 4,
      originalError: original,
      rollbackError,
    });
  });

  it("still throws the original error when logging the failed rollback fails", async () => {
    const tx = fakeTx(async () => {
      throw new Error("connection lost");
    });
    mockTransaction.mockResolvedValue(tx);
    mockLogRollbackFailure.mockRejectedValue(new Error("log down"));
    const original = new Error("write failed");
    await expect(
      inTransaction(undefined, context, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });
});
