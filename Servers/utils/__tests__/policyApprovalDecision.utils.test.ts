/**
 * Unit tests for what an approval decision does to a policy.
 * sequelize.query is mocked, so these assert the SQL shape and the history
 * write, not Postgres behaviour.
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../changeHistory.base.utils", () => ({
  trackEntityChanges: jest.fn(async (_type: string, oldData: any, newData: any) =>
    oldData.status === newData.status
      ? []
      : [{ fieldName: "Status", oldValue: String(oldData.status), newValue: newData.status }],
  ),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  applyPolicyApprovalDecision,
  recordPolicyStatusChange,
} from "../policyApprovalDecision.utils";
import { recordMultipleFieldChanges } from "../changeHistory.base.utils";
import logger from "../logger/fileLogger";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockRecord = recordMultipleFieldChanges as jest.Mock;
const transaction = {} as any;

beforeEach(() => {
  mockQuery.mockReset();
  mockRecord.mockClear();
  (logger.warn as jest.Mock).mockClear();
});

describe("applyPolicyApprovalDecision", () => {
  it("approves: status, review fields, decider and comment, matched on org and Under Review", async () => {
    mockQuery.mockResolvedValue([{ id: 55 }]);

    const updated = await applyPolicyApprovalDecision({
      organizationId: 1,
      policyId: 55,
      decision: "approved",
      actorId: 5,
      comment: "  Looks right  ",
      transaction,
    });

    expect(updated).toBe(true);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'Approved'/);
    expect(sql).toMatch(/review_status = 'approved'/);
    expect(sql).toMatch(/reviewed_by = :actorId/);
    expect(sql).toMatch(/reviewed_at = NOW\(\)/);
    expect(sql).toMatch(/review_comment = :comment/);
    expect(sql).toMatch(
      /WHERE organization_id = :organizationId\s+AND id = :policyId\s+AND status = :underReview/,
    );
    expect(options.replacements).toEqual({
      organizationId: 1,
      policyId: 55,
      actorId: 5,
      comment: "Looks right",
      underReview: "Under Review",
    });
    expect(options.transaction).toBe(transaction);
    expect(mockRecord).toHaveBeenCalledWith(
      "policy",
      55,
      5,
      1,
      [{ fieldName: "Status", oldValue: "Under Review", newValue: "Approved" }],
      transaction,
    );
  });

  it("approves with a null comment when none is given", async () => {
    mockQuery.mockResolvedValue([{ id: 55 }]);

    await applyPolicyApprovalDecision({
      organizationId: 1,
      policyId: 55,
      decision: "approved",
      actorId: 5,
      comment: "   ",
      transaction,
    });

    expect(mockQuery.mock.calls[0][1].replacements.comment).toBeNull();
  });

  it("rejects: back to Draft with changes requested and the comment", async () => {
    mockQuery.mockResolvedValue([{ id: 55 }]);

    await applyPolicyApprovalDecision({
      organizationId: 1,
      policyId: 55,
      decision: "rejected",
      actorId: 5,
      comment: "Fix section 2",
      transaction,
    });

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'Draft'/);
    expect(sql).toMatch(/review_status = 'changes_requested'/);
    expect(sql).toMatch(/review_comment = :comment/);
    expect(sql).toMatch(/reviewed_by = :actorId/);
    expect(options.replacements.comment).toBe("Fix section 2");
    expect(mockRecord).toHaveBeenCalledWith(
      "policy",
      55,
      5,
      1,
      [{ fieldName: "Status", oldValue: "Under Review", newValue: "Draft" }],
      transaction,
    );
  });

  it("withdraws: back to Draft, review status cleared, review fields kept", async () => {
    mockQuery.mockResolvedValue([{ id: 55 }]);

    await applyPolicyApprovalDecision({
      organizationId: 1,
      policyId: 55,
      decision: "withdrawn",
      actorId: 3,
      transaction,
    });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'Draft'/);
    expect(sql).toMatch(/review_status = NULL/);
    expect(sql).not.toMatch(/reviewed_by/);
    expect(sql).not.toMatch(/review_comment/);
    expect(mockRecord).toHaveBeenCalledWith("policy", 55, 3, 1, expect.any(Array), transaction);
  });

  it("warns and does not throw or record history when the policy is not under review", async () => {
    mockQuery.mockResolvedValue([]);

    const updated = await applyPolicyApprovalDecision({
      organizationId: 1,
      policyId: 55,
      decision: "approved",
      actorId: 5,
      transaction,
    });

    expect(updated).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("policy 55"));
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe("recordPolicyStatusChange", () => {
  it("records nothing when the status did not change", async () => {
    await recordPolicyStatusChange(1, 55, 5, "Under Review", "Under Review", transaction);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("records the change with the actor", async () => {
    await recordPolicyStatusChange(1, 55, 5, "Draft", "Under Review", transaction);
    expect(mockRecord).toHaveBeenCalledWith(
      "policy",
      55,
      5,
      1,
      [{ fieldName: "Status", oldValue: "Draft", newValue: "Under Review" }],
      transaction,
    );
  });
});
