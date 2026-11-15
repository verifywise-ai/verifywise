/**
 * Unit tests for the policy side of the generic approval workflow in
 * approvalRequest.utils: decisions and withdrawals move the policy on, and a
 * request on a deleted entity is rejected with the right columns.
 * sequelize.query is mocked and routed by SQL, so these assert the dispatch
 * and SQL shape, not Postgres behaviour.
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));
jest.mock("../lifecycle.utils", () => ({ releaseUseCaseFromReview: jest.fn() }));
jest.mock("../policyApprovalDecision.utils", () => ({
  applyPolicyApprovalDecision: jest.fn().mockResolvedValue(true),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../database/db";
import {
  processApprovalQuery,
  rejectApprovalRequestOnEntityDelete,
  withdrawApprovalRequestQuery,
} from "../approvalRequest.utils";
import { applyPolicyApprovalDecision } from "../policyApprovalDecision.utils";
import { releaseUseCaseFromReview } from "../lifecycle.utils";
import {
  ApprovalRequestStatus,
  ApprovalResult,
} from "../../domain.layer/enums/approval-workflow.enum";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockTransactionFactory = sequelize.transaction as unknown as jest.Mock;
const mockApply = applyPolicyApprovalDecision as jest.Mock;
const transaction = { afterCommit: jest.fn() } as any;

/** Routes processApprovalQuery's queries for a request on `entityType`. */
const routeDecision = (opts: {
  entityType: string | null;
  entityId?: number | null;
  currentStep?: number;
  totalSteps?: number;
  vote: ApprovalResult;
}) => {
  const { entityType, entityId = 55, currentStep = 1, totalSteps = 1, vote } = opts;
  mockQuery.mockImplementation((sql: string) => {
    if (/FROM approval_requests[\s\S]*FOR UPDATE/.test(sql)) {
      return Promise.resolve([
        {
          id: 7,
          status: ApprovalRequestStatus.PENDING,
          current_step: currentStep,
          entity_type: entityType,
          entity_id: entityId,
          requested_by: 3,
          request_name: "Acceptable use",
        },
      ]);
    }
    if (/FROM approval_request_steps[\s\S]*step_number = :stepNumber/.test(sql)) {
      return Promise.resolve([{ id: 70 }]);
    }
    if (/SELECT approval_result\s+FROM approval_request_step_approvals/.test(sql)) {
      return Promise.resolve([{ approval_result: ApprovalResult.PENDING }]);
    }
    if (/requires_all_approvers/.test(sql)) {
      return Promise.resolve([{ requires_all_approvers: true }]);
    }
    if (/SELECT approver_id, approval_result/.test(sql)) {
      return Promise.resolve([{ approver_id: 5, approval_result: vote }]);
    }
    if (/COUNT\(\*\) as count FROM approval_request_steps/.test(sql)) {
      return Promise.resolve([{ count: String(totalSteps) }]);
    }
    return Promise.resolve([]);
  });
};

beforeEach(() => {
  mockQuery.mockReset();
  mockApply.mockClear();
  (releaseUseCaseFromReview as jest.Mock).mockClear();
  mockTransactionFactory.mockReset();
});

describe("processApprovalQuery policy branches", () => {
  it("approves the policy on the final approval, with the decider and comment", async () => {
    routeDecision({ entityType: "policy", vote: ApprovalResult.APPROVED });

    const info = await processApprovalQuery(
      7,
      5,
      ApprovalResult.APPROVED,
      "Looks right",
      1,
      transaction,
    );

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith({
      organizationId: 1,
      policyId: 55,
      requestId: 7,
      decision: "approved",
      actorId: 5,
      comment: "Looks right",
      transaction,
    });
    expect(info).toMatchObject({
      type: "requester_approved",
      requesterId: 3,
      entityType: "policy",
      entityId: 55,
    });
  });

  it("leaves the policy under review when an earlier step completes", async () => {
    routeDecision({
      entityType: "policy",
      vote: ApprovalResult.APPROVED,
      currentStep: 1,
      totalSteps: 2,
    });

    const info = await processApprovalQuery(
      7,
      5,
      ApprovalResult.APPROVED,
      undefined,
      1,
      transaction,
    );

    expect(info?.type).toBe("step_approvers");
    // The next step's approvers learn which policy it is.
    expect(info).toMatchObject({ entityType: "policy", entityId: 55 });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("sends the policy back to draft on a rejection at any step", async () => {
    routeDecision({
      entityType: "policy",
      vote: ApprovalResult.REJECTED,
      currentStep: 1,
      totalSteps: 3,
    });

    const info = await processApprovalQuery(
      7,
      5,
      ApprovalResult.REJECTED,
      "Fix section 2",
      1,
      transaction,
    );

    expect(mockApply).toHaveBeenCalledWith({
      organizationId: 1,
      policyId: 55,
      requestId: 7,
      decision: "rejected",
      actorId: 5,
      comment: "Fix section 2",
      transaction,
    });
    expect(info).toMatchObject({
      type: "requester_rejected",
      entityType: "policy",
      entityId: 55,
    });
  });

  it.each([ApprovalResult.APPROVED, ApprovalResult.REJECTED])(
    "does not touch policies for other entity types (%s)",
    async (vote) => {
      routeDecision({ entityType: "file", vote });

      await processApprovalQuery(7, 5, vote, "c", 1, transaction);

      expect(mockApply).not.toHaveBeenCalled();
    },
  );

  it("skips the policy update when the request has no entity id", async () => {
    routeDecision({ entityType: "policy", entityId: null, vote: ApprovalResult.APPROVED });

    await processApprovalQuery(7, 5, ApprovalResult.APPROVED, undefined, 1, transaction);

    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("withdrawApprovalRequestQuery", () => {
  it("withdraws only a pending request", async () => {
    mockQuery.mockResolvedValue([]);

    await withdrawApprovalRequestQuery(7, 1, transaction, { changedBy: 3 });

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/AND status = :pending/);
    expect(options.replacements).toMatchObject({
      organizationId: 1,
      requestId: 7,
      status: ApprovalRequestStatus.WITHDRAWN,
      pending: ApprovalRequestStatus.PENDING,
    });
    // Nothing was withdrawn, so no entity moves.
    expect(mockApply).not.toHaveBeenCalled();
    expect(releaseUseCaseFromReview).not.toHaveBeenCalled();
  });

  it("sends a withdrawn policy back to draft with the withdrawer as actor", async () => {
    mockQuery.mockResolvedValue([{ entity_type: "policy", entity_id: 55 }]);

    await withdrawApprovalRequestQuery(7, 1, transaction, { changedBy: 3 });

    expect(mockApply).toHaveBeenCalledWith({
      organizationId: 1,
      policyId: 55,
      requestId: 7,
      decision: "withdrawn",
      actorId: 3,
      transaction,
    });
    expect(releaseUseCaseFromReview).not.toHaveBeenCalled();
  });

  it("records a system withdrawal with no actor", async () => {
    mockQuery.mockResolvedValue([{ entity_type: "policy", entity_id: 55 }]);

    await withdrawApprovalRequestQuery(7, 1, transaction);

    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }));
  });

  it("still releases a use case and leaves policies alone", async () => {
    mockQuery.mockResolvedValue([{ entity_type: "use_case", entity_id: 9 }]);

    await withdrawApprovalRequestQuery(7, 1, transaction, { changedBy: 3 });

    expect(releaseUseCaseFromReview).toHaveBeenCalledWith(1, 9, 3, transaction);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("rejectApprovalRequestOnEntityDelete", () => {
  const routeReject = (status: string = ApprovalRequestStatus.PENDING) => {
    mockQuery.mockImplementation((sql: string) => {
      if (/SELECT id, request_name, requested_by, status/.test(sql)) {
        return Promise.resolve([
          {
            id: 7,
            request_name: "Acceptable use",
            requested_by: 3,
            status,
            entity_type: "policy",
            entity_id: 55,
          },
        ]);
      }
      return Promise.resolve([]);
    });
  };

  it("writes approval_result and approved_at on the pending votes", async () => {
    routeReject();
    const outer = { commit: jest.fn(), rollback: jest.fn() } as any;

    await rejectApprovalRequestOnEntityDelete(7, 1, "The policy was deleted.", outer);

    const voteUpdate = mockQuery.mock.calls.find((call) =>
      /UPDATE approval_request_step_approvals/.test(String(call[0])),
    );
    expect(voteUpdate).toBeDefined();
    const sql = String(voteUpdate![0]);
    expect(sql).toMatch(/SET approval_result = :result, comments = :reason, approved_at = NOW\(\)/);
    expect(sql).toMatch(/AND approval_result = :pendingResult/);
    expect(sql).not.toMatch(/date_responded/);
    expect(sql).not.toMatch(/\bstatus\b/);
    expect(voteUpdate![1].replacements).toMatchObject({
      result: ApprovalResult.REJECTED,
      pendingResult: ApprovalResult.PENDING,
      reason: "The policy was deleted.",
    });
  });

  it("runs inside the caller's transaction without committing it", async () => {
    routeReject();
    const outer = { commit: jest.fn(), rollback: jest.fn() } as any;

    const info = await rejectApprovalRequestOnEntityDelete(7, 1, "gone", outer);

    expect(mockTransactionFactory).not.toHaveBeenCalled();
    expect(outer.commit).not.toHaveBeenCalled();
    expect(outer.rollback).not.toHaveBeenCalled();
    for (const call of mockQuery.mock.calls) {
      expect(call[1].transaction).toBe(outer);
    }
    expect(info).toMatchObject({
      type: "requester_rejected",
      requestId: 7,
      requesterId: 3,
      entityType: "policy",
      entityId: 55,
    });
  });

  it("opens and commits its own transaction when none is given", async () => {
    routeReject();
    const own = { commit: jest.fn(), rollback: jest.fn() };
    mockTransactionFactory.mockResolvedValue(own);

    await rejectApprovalRequestOnEntityDelete(7, 1);

    expect(own.commit).toHaveBeenCalled();
  });

  it("returns null and leaves a caller's transaction alone when not pending", async () => {
    routeReject(ApprovalRequestStatus.APPROVED);
    const outer = { commit: jest.fn(), rollback: jest.fn() } as any;

    const info = await rejectApprovalRequestOnEntityDelete(7, 1, "gone", outer);

    expect(info).toBeNull();
    expect(outer.rollback).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some((c) => /^\s*UPDATE/.test(String(c[0])))).toBe(false);
  });

  it("rolls back its own transaction on failure and rethrows", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    const own = { commit: jest.fn(), rollback: jest.fn() };
    mockTransactionFactory.mockResolvedValue(own);

    await expect(rejectApprovalRequestOnEntityDelete(7, 1)).rejects.toThrow("db down");
    expect(own.rollback).toHaveBeenCalled();
  });
});
