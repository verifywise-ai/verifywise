import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Transaction } from "sequelize";

// Isolate the registry from the real factory: capture the storage instance it
// is handed so delete calls can be asserted.
const mockDelete = jest.fn<any>();
jest.mock("../index", () => ({
  getStorageForProvider: () => ({ delete: (...args: any[]) => mockDelete(...args) }),
}));

import {
  cleanupPendingPuts,
  deleteObjectOnCommit,
  registerPendingPut,
  withStorageCleanup,
} from "../transactionRegistry";

type CommitCallback = () => Promise<void> | void;

function fakeTransaction() {
  const afterCommitCallbacks: CommitCallback[] = [];
  const rollback = jest.fn<any>().mockResolvedValue(undefined);
  const transaction = {
    rollback,
    afterCommit: jest.fn((cb: CommitCallback) => {
      afterCommitCallbacks.push(cb);
    }),
  } as unknown as Transaction;
  return { transaction, rollback, afterCommitCallbacks };
}

const S3_REF = { provider: "s3" as const, key: "files/org-1/a.pdf" };

beforeEach(() => {
  mockDelete.mockReset();
  mockDelete.mockResolvedValue(undefined);
});

describe("registerPendingPut + rollback cleanup", () => {
  it("ignores keyless refs (local provider) and missing transactions", () => {
    const { transaction, rollback } = fakeTransaction();
    registerPendingPut(transaction, { provider: "local", key: null });
    registerPendingPut(undefined, S3_REF);
    registerPendingPut(null, S3_REF);

    return expect((transaction.rollback as () => Promise<void>)())
      .resolves.toBeUndefined()
      .then(() => {
        expect(mockDelete).not.toHaveBeenCalled();
        expect(rollback).toHaveBeenCalledTimes(1);
      });
  });

  it("deletes pending objects when the transaction rolls back", async () => {
    const { transaction, rollback } = fakeTransaction();
    registerPendingPut(transaction, S3_REF);

    await transaction.rollback();

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(S3_REF.key);
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it("cleans up each key only once even if rollback is invoked twice", async () => {
    const { transaction } = fakeTransaction();
    registerPendingPut(transaction, S3_REF);
    registerPendingPut(transaction, { provider: "s3", key: "files/org-1/b.pdf" });

    await transaction.rollback();
    await transaction.rollback();

    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("does nothing on the commit path", () => {
    const { transaction } = fakeTransaction();
    registerPendingPut(transaction, S3_REF);
    // No rollback: nothing is ever deleted.
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("survives a failing object delete without breaking the rollback", async () => {
    mockDelete.mockRejectedValueOnce(new Error("s3 down"));
    const { transaction, rollback } = fakeTransaction();
    registerPendingPut(transaction, S3_REF);

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(transaction.rollback()).resolves.toBeUndefined();
    expect(rollback).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe("withStorageCleanup", () => {
  it("returns the work result and deletes nothing on success", async () => {
    const { transaction } = fakeTransaction();
    const result = await withStorageCleanup(transaction, async () => {
      registerPendingPut(transaction, S3_REF);
      return 42;
    });

    expect(result).toBe(42);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes pending objects and rethrows when the work fails", async () => {
    const { transaction } = fakeTransaction();
    const failure = new Error("db write failed");

    await expect(
      withStorageCleanup(transaction, async () => {
        registerPendingPut(transaction, S3_REF);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(mockDelete).toHaveBeenCalledWith(S3_REF.key);
  });
});

describe("cleanupPendingPuts", () => {
  it("is exported for manual catch-block / early-rollback use", async () => {
    const { transaction } = fakeTransaction();
    registerPendingPut(transaction, S3_REF);

    await cleanupPendingPuts(transaction);
    expect(mockDelete).toHaveBeenCalledWith(S3_REF.key);

    // Idempotent: a later rollback finds nothing left.
    await transaction.rollback();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

describe("deleteObjectOnCommit", () => {
  it("defers the delete until afterCommit fires", async () => {
    const { transaction, afterCommitCallbacks } = fakeTransaction();
    deleteObjectOnCommit(transaction, S3_REF);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(afterCommitCallbacks).toHaveLength(1);

    await afterCommitCallbacks[0]();
    expect(mockDelete).toHaveBeenCalledWith(S3_REF.key);
  });

  it("deletes immediately when there is no transaction", async () => {
    deleteObjectOnCommit(undefined, S3_REF);
    // Immediate path is fire-and-forget: let the microtask run.
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockDelete).toHaveBeenCalledWith(S3_REF.key);
  });

  it("ignores keyless refs in both modes", async () => {
    const { transaction, afterCommitCallbacks } = fakeTransaction();
    deleteObjectOnCommit(transaction, { provider: "local", key: null });
    deleteObjectOnCommit(undefined, { provider: "local", key: null });

    expect(afterCommitCallbacks).toHaveLength(0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("batches multiple refs for one transaction into a single flush", async () => {
    const { transaction, afterCommitCallbacks } = fakeTransaction();
    deleteObjectOnCommit(transaction, S3_REF);
    deleteObjectOnCommit(transaction, { provider: "s3", key: "files/org-1/b.pdf" });

    expect(afterCommitCallbacks).toHaveLength(1);
    await afterCommitCallbacks[0]();
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("logs but does not throw when a post-commit delete fails", async () => {
    mockDelete.mockRejectedValueOnce(new Error("s3 down"));
    const { transaction, afterCommitCallbacks } = fakeTransaction();
    deleteObjectOnCommit(transaction, S3_REF);

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(afterCommitCallbacks[0]()).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});
