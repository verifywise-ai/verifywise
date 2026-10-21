/**
 * Unit tests for who may decide an approval step (processApprovalQuery) and
 * which requests count as waiting on a user (getPendingApprovalsQuery).
 * sequelize.query is mocked, so these assert the guard and the SQL shape,
 * not Postgres behaviour.
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { getPendingApprovalsQuery, processApprovalQuery } from "../approvalRequest.utils";
import {
  ApprovalRequestStatus,
  ApprovalResult,
  ApprovalStepStatus,
} from "../../domain.layer/enums/approval-workflow.enum";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const mockQuery = sequelize.query as unknown as jest.Mock;
const transaction = {} as any;

const queueRequestAndStep = (
  myApproval: { approval_result: string } | undefined,
  votedOnEarlierStep = false,
) => {
  mockQuery
    .mockResolvedValueOnce([{ id: 7, status: ApprovalRequestStatus.PENDING, current_step: 1 }])
    .mockResolvedValueOnce([{ id: 70 }])
    .mockResolvedValueOnce(myApproval ? [myApproval] : []);
  if (!myApproval) {
    mockQuery.mockResolvedValueOnce(votedOnEarlierStep ? [{ "?column?": 1 }] : []);
  }
};

const sqlCalls = () => mockQuery.mock.calls.map((call) => String(call[0]));

describe("processApprovalQuery decision guard", () => {
  beforeEach(() => mockQuery.mockReset());

  it.each([ApprovalResult.APPROVED, ApprovalResult.REJECTED])(
    "refuses a %s from a user who is not an approver on the current step",
    async (result) => {
      queueRequestAndStep(undefined);

      await expect(
        processApprovalQuery(7, 99, result, undefined, 1, transaction),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Nothing was written: no vote, no step or request status change.
      expect(sqlCalls().some((sql) => /^\s*UPDATE/i.test(sql))).toBe(false);
    },
  );

  it.each([ApprovalResult.APPROVED, ApprovalResult.REJECTED])(
    "refuses a second decision from an approver who already responded (%s)",
    async (result) => {
      queueRequestAndStep({ approval_result: ApprovalResult.APPROVED });

      await expect(
        processApprovalQuery(7, 5, result, undefined, 1, transaction),
      ).rejects.toBeInstanceOf(ValidationException);

      expect(sqlCalls().some((sql) => /^\s*UPDATE/i.test(sql))).toBe(false);
    },
  );

  it("treats a retry after the user's vote moved the request on as a repeat, not a 403", async () => {
    queueRequestAndStep(undefined, true);

    await expect(
      processApprovalQuery(7, 5, ApprovalResult.APPROVED, undefined, 1, transaction),
    ).rejects.toBeInstanceOf(ValidationException);

    const [sql, options] = mockQuery.mock.calls[3];
    expect(sql).toMatch(/ars\.request_id = :requestId/);
    expect(options.replacements).toEqual({
      organizationId: 1,
      requestId: 7,
      userId: 5,
      pending: ApprovalResult.PENDING,
    });
    expect(sqlCalls().some((s) => /^\s*UPDATE/i.test(s))).toBe(false);
  });

  it("locks the request row first so concurrent decisions run one at a time", async () => {
    queueRequestAndStep(undefined);

    await expect(
      processApprovalQuery(7, 99, ApprovalResult.APPROVED, undefined, 1, transaction),
    ).rejects.toThrow();

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FROM approval_requests[\s\S]*FOR UPDATE/);
    expect(options.replacements).toEqual({ organizationId: 1, requestId: 7 });
    expect(options.transaction).toBe(transaction);
  });

  it("scopes the approver lookup to the org, step and user", async () => {
    queueRequestAndStep(undefined);

    await expect(
      processApprovalQuery(7, 99, ApprovalResult.APPROVED, undefined, 1, transaction),
    ).rejects.toThrow();

    const [, options] = mockQuery.mock.calls[2];
    expect(options.replacements).toEqual({ organizationId: 1, requestStepId: 70, userId: 99 });
    expect(options.transaction).toBe(transaction);
  });

  it("records the vote when the approver is still pending", async () => {
    queueRequestAndStep({ approval_result: ApprovalResult.PENDING });
    // Any later query: return an empty result so the function can run on.
    mockQuery.mockResolvedValue([]);

    await processApprovalQuery(7, 5, ApprovalResult.APPROVED, "ok", 1, transaction).catch(
      () => undefined,
    );

    const update = mockQuery.mock.calls.find((call) =>
      /UPDATE approval_request_step_approvals/.test(String(call[0])),
    );
    expect(update).toBeDefined();
    expect(update![1].replacements).toMatchObject({
      userId: 5,
      approvalResult: ApprovalResult.APPROVED,
      comments: "ok",
    });
  });
});

describe("processApprovalQuery admin override", () => {
  beforeEach(() => mockQuery.mockReset());

  // Request 7 by user 3, on step 1 (id 70) of 2.
  const queueOverrideRequest = () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 7, status: ApprovalRequestStatus.PENDING, current_step: 1, requested_by: 3 },
      ])
      .mockResolvedValueOnce([{ id: 70 }]);
  };

  it.each([
    ["the step it named has moved on", 2, 9, "approver left"],
    ["it has no comment", 1, 9, "  "],
  ])("refuses an override when %s", async (_label, stepNumber, userId, comments) => {
    queueOverrideRequest();

    await expect(
      processApprovalQuery(7, userId, ApprovalResult.APPROVED, comments, 1, transaction, {
        stepNumber,
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(sqlCalls().some((sql) => /^\s*(INSERT|UPDATE)/i.test(sql))).toBe(false);
  });

  it("refuses an override of the admin's own request", async () => {
    queueOverrideRequest();

    await expect(
      processApprovalQuery(7, 3, ApprovalResult.APPROVED, "mine", 1, transaction, {
        stepNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sqlCalls().some((sql) => /^\s*(INSERT|UPDATE)/i.test(sql))).toBe(false);
  });

  it("records the admin's vote and completes a step still waiting on others", async () => {
    queueOverrideRequest();
    mockQuery.mockImplementation(async (sql: string) => {
      if (/requires_all_approvers/.test(sql)) return [{ requires_all_approvers: true }];
      if (/SELECT approver_id, approval_result/.test(sql)) {
        return [
          { approver_id: 6, approval_result: ApprovalResult.PENDING },
          { approver_id: 9, approval_result: ApprovalResult.APPROVED },
        ];
      }
      if (/COUNT\(\*\)/.test(sql)) return [{ count: "2" }];
      return [];
    });

    const result = await processApprovalQuery(
      7,
      9,
      ApprovalResult.APPROVED,
      "approver left",
      1,
      transaction,
      { stepNumber: 1 },
    );

    expect(result).toMatchObject({ type: "step_approvers", stepNumber: 2, completedStep: 1 });
    const insert = mockQuery.mock.calls.find((call) =>
      /INSERT INTO approval_request_step_approvals/.test(String(call[0])),
    );
    expect(insert![1].replacements).toMatchObject({
      requestStepId: 70,
      userId: 9,
      approvalResult: ApprovalResult.APPROVED,
      comments: "approver left",
    });
    const marker = mockQuery.mock.calls.find((call) => /SET step_details/.test(String(call[0])));
    expect(JSON.parse(marker![1].replacements.stepDetails)).toEqual({
      admin_override: true,
      actor_id: 9,
      result: ApprovalResult.APPROVED,
      reason: "approver left",
    });
    const completeStep = mockQuery.mock.calls.find(
      (call) =>
        /UPDATE approval_request_steps/.test(String(call[0])) &&
        call[1].replacements.status === ApprovalStepStatus.COMPLETED,
    );
    expect(completeStep).toBeDefined();
  });

  it("keeps a matching vote the admin already cast instead of rewriting it", async () => {
    queueOverrideRequest();
    mockQuery.mockResolvedValueOnce([{ approval_result: ApprovalResult.APPROVED }]);
    mockQuery.mockImplementation(async (sql: string) => {
      if (/requires_all_approvers/.test(sql)) return [{ requires_all_approvers: true }];
      if (/COUNT\(\*\)/.test(sql)) return [{ count: "2" }];
      return [];
    });

    await processApprovalQuery(7, 9, ApprovalResult.APPROVED, "approver left", 1, transaction, {
      stepNumber: 1,
    });

    expect(sqlCalls().some((sql) => /INSERT INTO approval_request_step_approvals/.test(sql))).toBe(
      false,
    );
    expect(sqlCalls().some((sql) => /SET step_details/.test(sql))).toBe(true);
  });

  it("refuses an override that contradicts a vote the admin already cast", async () => {
    queueOverrideRequest();
    mockQuery.mockResolvedValueOnce([{ approval_result: ApprovalResult.APPROVED }]);

    await expect(
      processApprovalQuery(7, 9, ApprovalResult.REJECTED, "approver left", 1, transaction, {
        stepNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(sqlCalls().some((sql) => /^\s*(INSERT|UPDATE)/i.test(sql))).toBe(false);
  });
});

describe("getPendingApprovalsQuery", () => {
  beforeEach(() => mockQuery.mockReset());

  it("only lists requests the user has not responded to yet", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await getPendingApprovalsQuery(5, 1);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/arsa\.approval_result = :pendingResult/);
    expect(options.replacements.pendingResult).toBe(ApprovalResult.PENDING);
  });
});
