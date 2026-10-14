import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../project.utils", () => ({
  deleteProjectByIdQuery: jest.fn(),
  lockProjectForDelete: jest.fn(),
}));
jest.mock("../approvalRequest.utils", () => ({
  getPendingApprovalRequestIdQuery: jest.fn(),
  withdrawApprovalRequestQuery: jest.fn(),
}));
jest.mock("../useCaseChangeHistory.utils", () => ({
  recordUseCaseDeletion: jest.fn(),
}));

import { deleteProjectWithSideEffects } from "../projectDeletion.utils";
import { deleteProjectByIdQuery, lockProjectForDelete } from "../project.utils";
import {
  getPendingApprovalRequestIdQuery,
  withdrawApprovalRequestQuery,
} from "../approvalRequest.utils";
import { recordUseCaseDeletion } from "../useCaseChangeHistory.utils";

const lock = lockProjectForDelete as unknown as jest.Mock<(...a: any[]) => Promise<any>>;
const del = deleteProjectByIdQuery as unknown as jest.Mock<(...a: any[]) => Promise<any>>;
const pending = getPendingApprovalRequestIdQuery as unknown as jest.Mock<
  (...a: any[]) => Promise<any>
>;
const withdraw = withdrawApprovalRequestQuery as unknown as jest.Mock<
  (...a: any[]) => Promise<any>
>;
const record = recordUseCaseDeletion as unknown as jest.Mock<(...a: any[]) => Promise<any>>;
const tx = { id: "tx" } as any;

beforeEach(() => {
  jest.clearAllMocks();
  lock.mockResolvedValue(true);
  del.mockResolvedValue(true);
  pending.mockResolvedValue(900);
  withdraw.mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
});

const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];

describe("deleteProjectWithSideEffects", () => {
  it("locks, withdraws the approval, records history, then deletes (the one order)", async () => {
    const result = await deleteProjectWithSideEffects(111, 5, tx, { userId: 8 });

    expect(result).toEqual({ deleted: true, withdrawnApprovalId: 900 });
    expect(lock).toHaveBeenCalledWith(111, 5, tx);
    expect(withdraw).toHaveBeenCalledWith(900, 5, tx);
    expect(record).toHaveBeenCalledWith(111, 8, 5, tx);
    expect(del).toHaveBeenCalledWith(111, 5, tx, {
      enqueueAutomationAfterCommit: false,
    });
    expect(order(lock)).toBeLessThan(order(pending));
    expect(order(pending)).toBeLessThan(order(withdraw));
    expect(order(withdraw)).toBeLessThan(order(record));
    expect(order(record)).toBeLessThan(order(del));
  });

  it("skips its own lock when the caller already holds it", async () => {
    await deleteProjectWithSideEffects(111, 5, tx, {
      userId: 8,
      alreadyLocked: true,
      enqueueAutomationAfterCommit: true,
    });

    expect(lock).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(111, 5, tx, {
      enqueueAutomationAfterCommit: true,
    });
  });

  it("can skip the approval withdrawal and the history (demo data)", async () => {
    await deleteProjectWithSideEffects(111, 5, tx, {
      alreadyLocked: true,
      withdrawApproval: false,
      recordHistory: false,
    });

    expect(pending).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("stops at the lock when the project is not in the organization", async () => {
    lock.mockResolvedValue(false);

    const result = await deleteProjectWithSideEffects(111, 5, tx, { userId: 8 });

    expect(result).toEqual({ deleted: false, withdrawnApprovalId: null });
    expect(pending).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("records no history without a user", async () => {
    await deleteProjectWithSideEffects(111, 5, tx, {});

    expect(record).not.toHaveBeenCalled();
  });
});
