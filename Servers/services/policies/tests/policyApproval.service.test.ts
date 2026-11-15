/**
 * Unit tests for policy approval through the generic approval workflow:
 * usable workflows, submit, Admin direct approve, the approval state read and
 * the delete-time rejection. sequelize.query is mocked and routed by SQL.
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/approvalRequest.utils", () => ({
  createApprovalRequestQuery: jest.fn(),
  rejectApprovalRequestOnEntityDelete: jest.fn(),
}));
jest.mock("../../../utils/approvalWorkflow.utils", () => ({
  getWorkflowStepsQuery: jest.fn(),
}));
jest.mock("../../../utils/policyManager.utils", () => ({
  getPolicyByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/policyApprovalDecision.utils", () => ({
  POLICY_UNDER_REVIEW: "Under Review",
  recordPolicyStatusChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(),
}));
jest.mock("../../approvalRequestNotification.service", () => ({
  notifyFirstStepApprovers: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../notification.service", () => ({
  notifyRequesterRejected: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import {
  createApprovalRequestQuery,
  rejectApprovalRequestOnEntityDelete,
} from "../../../utils/approvalRequest.utils";
import { getWorkflowStepsQuery } from "../../../utils/approvalWorkflow.utils";
import { getPolicyByIdQuery } from "../../../utils/policyManager.utils";
import { recordPolicyStatusChange } from "../../../utils/policyApprovalDecision.utils";
import { roleHasPermission } from "../../../utils/rolePermissions.utils";
import { notifyFirstStepApprovers } from "../../approvalRequestNotification.service";
import { notifyRequesterRejected } from "../../notification.service";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  approvePolicyDirectly,
  getPendingPolicyRequest,
  getPolicyApprovalState,
  getUsablePolicyWorkflows,
  POLICY_APPROVAL_MESSAGES,
  assertPolicyDirectApprovalPossible,
  rejectPendingPolicyRequestOnDelete,
  submitPolicyForApproval,
} from "../policyApproval.service";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockTransactionFactory = sequelize.transaction as unknown as jest.Mock;
const mockCreateRequest = createApprovalRequestQuery as jest.Mock;
const mockGetSteps = getWorkflowStepsQuery as jest.Mock;
const mockGetPolicy = getPolicyByIdQuery as jest.Mock;
const mockRecordStatus = recordPolicyStatusChange as jest.Mock;
const mockRole = roleHasPermission as jest.Mock;
const mockNotifyApprovers = notifyFirstStepApprovers as jest.Mock;

const workflowA = { id: 11, workflow_title: "Legal review", step_count: 2 };
const workflowB = { id: 12, workflow_title: "Quick review", step_count: 1 };

interface Db {
  policy?: Record<string, any> | null;
  usable?: Array<typeof workflowA>;
  pending?: Record<string, any> | null;
  stateRow?: Record<string, any> | null;
}

/** Routes each query by its SQL so tests do not depend on call order. */
const routeDb = (db: Db) => {
  mockQuery.mockImplementation((sql: string) => {
    if (/FROM policy_manager[\s\S]*FOR UPDATE/.test(sql)) {
      return Promise.resolve(db.policy ? [db.policy] : []);
    }
    if (/FROM approval_workflows w/.test(sql)) {
      return Promise.resolve(db.usable ?? []);
    }
    if (/FROM approval_requests ar/.test(sql)) {
      return Promise.resolve(db.pending ? [db.pending] : []);
    }
    if (/FROM policy_manager pm\s+LEFT JOIN users/.test(sql)) {
      return Promise.resolve(db.stateRow ? [db.stateRow] : []);
    }
    return Promise.resolve([]);
  });
};

const draftPolicy = {
  id: 55,
  title: "Acceptable use",
  status: "Draft",
  tags: ["AI ethics"],
  next_review_date: "2027-01-01",
  policy_owner_id: 4,
};

const pendingRow = {
  id: 7,
  workflow_id: 11,
  workflow_title: "Legal review",
  current_step: 1,
  total_steps: 2,
  requested_by: 3,
  requested_by_name: "Ada Lovelace",
  created_at: new Date("2026-11-14T10:00:00Z"),
};

let tx: { commit: jest.Mock; rollback: jest.Mock; afterCommit: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  tx = { commit: jest.fn(), rollback: jest.fn(), afterCommit: jest.fn() };
  mockTransactionFactory.mockResolvedValue(tx);
  mockGetPolicy.mockResolvedValue([{ id: 55, status: "Under Review" }]);
  mockCreateRequest.mockResolvedValue({ id: 7 });
  mockGetSteps.mockResolvedValue([{ step_number: 1, approvers: [{ approver_id: 9 }] }]);
  mockRole.mockResolvedValue(false);
});

const updateCalls = () =>
  mockQuery.mock.calls.filter((c) => /^\s*UPDATE policy_manager/.test(String(c[0])));

describe("getUsablePolicyWorkflows", () => {
  it("filters on org, entity type, active, a step, and an approver on every step", async () => {
    mockQuery.mockResolvedValue([{ id: "11", workflow_title: "Legal review", step_count: "2" }]);

    const usable = await getUsablePolicyWorkflows(1);

    expect(usable).toEqual([workflowA]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/w\.organization_id = :organizationId/);
    expect(sql).toMatch(/w\.entity_type = 'policy'/);
    expect(sql).toMatch(/w\.is_active = true/);
    expect(sql).toMatch(/AND EXISTS \(\s*SELECT 1 FROM approval_workflow_steps/);
    expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM approval_step_approvers/);
    expect(sql).toMatch(/a\.organization_id = w\.organization_id/);
    expect(options.replacements).toEqual({ organizationId: 1 });
  });
});

describe("getPendingPolicyRequest", () => {
  it("returns null when nothing is pending", async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getPendingPolicyRequest(1, 55)).toBeNull();
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ar\.organization_id = :organizationId/);
    expect(sql).toMatch(/ar\.entity_type = 'policy'/);
    expect(options.replacements).toEqual({ organizationId: 1, policyId: 55, pending: "Pending" });
  });

  it("normalises numeric columns", async () => {
    mockQuery.mockResolvedValue([{ ...pendingRow, id: "7", total_steps: "2", requested_by: "3" }]);
    const pending = await getPendingPolicyRequest(1, 55);
    expect(pending).toMatchObject({ id: 7, total_steps: 2, requested_by: 3 });
  });
});

describe("submitPolicyForApproval", () => {
  it("creates the request, puts the policy under review and records history in one transaction", async () => {
    routeDb({ policy: draftPolicy, usable: [workflowA] });

    const result = await submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3 });

    expect(result).toEqual({ request_id: 7, policy: { id: 55, status: "Under Review" } });
    expect(mockGetSteps).toHaveBeenCalledWith(11, 1, tx);
    expect(mockCreateRequest).toHaveBeenCalledWith(
      {
        request_name: "Acceptable use",
        workflow_id: 11,
        entity_id: 55,
        entity_type: "policy",
        entity_data: {
          title: "Acceptable use",
          status: "Draft",
          tags: ["AI ethics"],
          next_review_date: "2027-01-01",
          policy_owner_id: 4,
        },
        status: "Pending",
        requested_by: 3,
      },
      [{ step_number: 1, approvers: [{ approver_id: 9 }] }],
      1,
      tx,
    );
    const [update] = updateCalls();
    const sql = String(update[0]);
    expect(sql).toMatch(/status = :underReview/);
    expect(sql).toMatch(/review_status = 'pending_review'/);
    expect(sql).toMatch(/review_comment = NULL/);
    expect(sql).toMatch(/reviewed_by = NULL/);
    expect(sql).toMatch(/reviewed_at = NULL/);
    expect(sql).toMatch(/last_updated_by = :userId/);
    expect(sql).toMatch(/WHERE organization_id = :organizationId AND id = :policyId/);
    expect(update[1].transaction).toBe(tx);
    expect(mockRecordStatus).toHaveBeenCalledWith(1, 55, 3, "Draft", "Under Review", tx);
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
    // Re-read after the commit.
    expect(mockGetPolicy).toHaveBeenCalledWith(1, 55);
  });

  it("notifies the step 1 approvers after the commit", async () => {
    routeDb({ policy: draftPolicy, usable: [workflowA] });

    await submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3 });

    expect(mockNotifyApprovers).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        requestId: 7,
        requestName: "Acceptable use",
        requesterId: 3,
        workflow: { workflow_title: "Legal review" },
        entity: { type: "policy", id: 55 },
      }),
    );
    expect(tx.commit.mock.invocationCallOrder[0]).toBeLessThan(
      mockNotifyApprovers.mock.invocationCallOrder[0],
    );
  });

  it("still succeeds when the approver notification fails", async () => {
    routeDb({ policy: draftPolicy, usable: [workflowA] });
    mockNotifyApprovers.mockRejectedValueOnce(new Error("mail down"));

    await expect(
      submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3 }),
    ).resolves.toMatchObject({ request_id: 7 });
  });

  it("accepts a legacy Under Review policy with no pending request", async () => {
    routeDb({ policy: { ...draftPolicy, status: "Under Review" }, usable: [workflowA] });

    await submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3 });

    expect(mockCreateRequest).toHaveBeenCalled();
    expect(mockRecordStatus).toHaveBeenCalledWith(1, 55, 3, "Under Review", "Under Review", tx);
  });

  it("uses the chosen workflow when several are usable", async () => {
    routeDb({ policy: draftPolicy, usable: [workflowA, workflowB] });

    await submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3, workflowId: 12 });

    expect(mockCreateRequest.mock.calls[0][0].workflow_id).toBe(12);
  });

  const expectRefused = async (
    db: Db,
    workflowId: number | undefined,
    errorClass: any,
    message: string,
    field?: string,
  ) => {
    routeDb(db);
    const error = await submitPolicyForApproval({
      orgId: 1,
      policyId: 55,
      userId: 3,
      workflowId,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(errorClass);
    expect(error.message).toBe(message);
    if (field) expect(error.metadata.field).toBe(field);
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(mockCreateRequest).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
    expect(mockNotifyApprovers).not.toHaveBeenCalled();
  };

  it("404 when the policy is not in the organization", () =>
    expectRefused(
      { policy: null },
      undefined,
      NotFoundException,
      POLICY_APPROVAL_MESSAGES.notFound,
    ));

  it("409 when a request is already pending", () =>
    expectRefused(
      { policy: draftPolicy, usable: [workflowA], pending: pendingRow },
      undefined,
      ConflictException,
      POLICY_APPROVAL_MESSAGES.pending,
    ));

  it.each(["Approved", "Published", "Archived", "Deprecated"])(
    "409 when the status is %s",
    (status) =>
      expectRefused(
        { policy: { ...draftPolicy, status }, usable: [workflowA] },
        undefined,
        ConflictException,
        POLICY_APPROVAL_MESSAGES.wrongStatus,
      ),
  );

  it("409 when the organization has no usable workflow", () =>
    expectRefused(
      { policy: draftPolicy, usable: [] },
      undefined,
      ConflictException,
      POLICY_APPROVAL_MESSAGES.noWorkflow,
    ));

  it("400 on workflow_id when several are usable and none is chosen", () =>
    expectRefused(
      { policy: draftPolicy, usable: [workflowA, workflowB] },
      undefined,
      ValidationException,
      POLICY_APPROVAL_MESSAGES.chooseWorkflow,
      "workflow_id",
    ));

  it("400 on workflow_id when the chosen workflow is not usable", () =>
    expectRefused(
      { policy: draftPolicy, usable: [workflowA] },
      99,
      ValidationException,
      POLICY_APPROVAL_MESSAGES.unusableWorkflow,
      "workflow_id",
    ));

  it("locks the policy row in the transaction", async () => {
    routeDb({ policy: draftPolicy, usable: [workflowA] });
    await submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3 });
    const lock = mockQuery.mock.calls.find((c) => /FOR UPDATE/.test(String(c[0])));
    expect(lock![1]).toMatchObject({
      replacements: { organizationId: 1, policyId: 55 },
      transaction: tx,
    });
  });

  it("rolls back and rethrows when the request insert fails", async () => {
    routeDb({ policy: draftPolicy, usable: [workflowA] });
    mockCreateRequest.mockRejectedValueOnce(new Error("insert failed"));

    await expect(submitPolicyForApproval({ orgId: 1, policyId: 55, userId: 3 })).rejects.toThrow(
      "insert failed",
    );
    expect(tx.rollback).toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });
});

describe("approvePolicyDirectly", () => {
  const asAdmin = () =>
    mockRole.mockImplementation(
      async (_org: number, _role: string, key: string) => key === "organization.admin",
    );

  it("approves with the Admin as reviewer, the comment, and history", async () => {
    asAdmin();
    routeDb({ policy: draftPolicy, usable: [] });
    mockGetPolicy.mockResolvedValue([{ id: 55, status: "Approved" }]);

    const policy = await approvePolicyDirectly({
      orgId: 1,
      policyId: 55,
      userId: 2,
      role: "Admin",
      comment: " Fine ",
    });

    expect(policy).toEqual({ id: 55, status: "Approved" });
    expect(mockRole).toHaveBeenCalledWith(1, "Admin", "organization.admin");
    const [update] = updateCalls();
    expect(String(update[0])).toMatch(/status = 'Approved'/);
    expect(String(update[0])).toMatch(/review_status = 'approved'/);
    // Stamped like any other change to the policy.
    expect(String(update[0])).toMatch(/last_updated_by = :userId/);
    expect(String(update[0])).toMatch(/last_updated_at = NOW\(\)/);
    expect(update[1].replacements).toEqual({
      organizationId: 1,
      policyId: 55,
      userId: 2,
      comment: "Fine",
    });
    expect(mockRecordStatus).toHaveBeenCalledWith(1, 55, 2, "Draft", "Approved", tx);
    expect(tx.commit).toHaveBeenCalled();
  });

  it("stores a null comment when none is given", async () => {
    asAdmin();
    routeDb({ policy: draftPolicy, usable: [] });

    await approvePolicyDirectly({ orgId: 1, policyId: 55, userId: 2, role: "Admin" });

    expect(updateCalls()[0][1].replacements.comment).toBeNull();
  });

  it("403 for a role without organization.admin, before touching the database", async () => {
    routeDb({ policy: draftPolicy, usable: [] });

    await expect(
      approvePolicyDirectly({ orgId: 1, policyId: 55, userId: 2, role: "Editor" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockTransactionFactory).not.toHaveBeenCalled();
  });

  it("403 when the caller has no role", async () => {
    await expect(
      approvePolicyDirectly({ orgId: 1, policyId: 55, userId: 2, role: undefined }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockRole).not.toHaveBeenCalled();
  });

  it("400 on comment when it is longer than 2000 characters", async () => {
    asAdmin();
    const error = await approvePolicyDirectly({
      orgId: 1,
      policyId: 55,
      userId: 2,
      role: "Admin",
      comment: "x".repeat(2001),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.metadata.field).toBe("comment");
    expect(mockTransactionFactory).not.toHaveBeenCalled();
  });

  it("400 on comment with its own message when it is not text", async () => {
    asAdmin();
    const error = await approvePolicyDirectly({
      orgId: 1,
      policyId: 55,
      userId: 2,
      role: "Admin",
      comment: 42 as unknown as string,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe(POLICY_APPROVAL_MESSAGES.commentNotText);
    expect(error.metadata.field).toBe("comment");
    expect(mockTransactionFactory).not.toHaveBeenCalled();
  });

  it("accepts a comment of exactly 2000 characters", async () => {
    asAdmin();
    routeDb({ policy: draftPolicy, usable: [] });
    await expect(
      approvePolicyDirectly({
        orgId: 1,
        policyId: 55,
        userId: 2,
        role: "Admin",
        comment: "x".repeat(2000),
      }),
    ).resolves.toBeDefined();
  });

  const expectRefused = async (db: Db, errorClass: any, message: string) => {
    asAdmin();
    routeDb(db);
    const error = await approvePolicyDirectly({
      orgId: 1,
      policyId: 55,
      userId: 2,
      role: "Admin",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(errorClass);
    expect(error.message).toBe(message);
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  };

  it("404 when the policy is not in the organization", () =>
    expectRefused({ policy: null }, NotFoundException, POLICY_APPROVAL_MESSAGES.notFound));

  it("409 when the organization has a usable workflow", () =>
    expectRefused(
      { policy: draftPolicy, usable: [workflowA] },
      ConflictException,
      POLICY_APPROVAL_MESSAGES.useWorkflow,
    ));

  it("409 when a request is pending", () =>
    expectRefused(
      { policy: draftPolicy, usable: [], pending: pendingRow },
      ConflictException,
      POLICY_APPROVAL_MESSAGES.pending,
    ));

  it.each(["Approved", "Published", "Archived", "Deprecated"])(
    "409 when the status is %s",
    (status) =>
      expectRefused(
        { policy: { ...draftPolicy, status }, usable: [] },
        ConflictException,
        POLICY_APPROVAL_MESSAGES.wrongStatus,
      ),
  );
});

describe("getPolicyApprovalState", () => {
  const stateRow = {
    status: "Draft",
    review_status: "changes_requested",
    review_comment: "Fix section 2",
    reviewed_by: "5",
    reviewed_at: new Date("2026-11-13T10:00:00Z"),
    reviewed_by_name: "Grace Hopper",
  };
  const grant = (...keys: string[]) =>
    mockRole.mockImplementation(async (_org: number, _role: string, key: string) =>
      keys.includes(key),
    );

  it("404 when the policy is not in the organization", async () => {
    routeDb({ stateRow: null });
    await expect(
      getPolicyApprovalState({ orgId: 1, policyId: 55, userId: 3, role: "Admin" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the last decision and lets an editor submit when a workflow is usable", async () => {
    grant("policy.edit");
    routeDb({ stateRow, usable: [workflowA] });

    const state = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 3,
      role: "Editor",
    });

    expect(state).toEqual({
      usable_workflows: [workflowA],
      pending_request: null,
      review_status: "changes_requested",
      review_comment: "Fix section 2",
      reviewed_by: 5,
      reviewed_by_name: "Grace Hopper",
      reviewed_at: stateRow.reviewed_at,
      can_submit: true,
      can_approve_directly: false,
      can_withdraw: false,
    });
  });

  it("hides an approval once the policy was moved by hand away from Approved", async () => {
    grant("policy.edit");
    routeDb({
      stateRow: { ...stateRow, status: "Draft", review_status: "approved", review_comment: "OK" },
      usable: [workflowA],
    });

    const state = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 3,
      role: "Editor",
    });

    expect(state).toEqual(
      expect.objectContaining({
        review_status: null,
        review_comment: null,
        reviewed_by: null,
        reviewed_by_name: null,
        reviewed_at: null,
        can_submit: true,
      }),
    );
  });

  it.each(["Approved", "Published"])(
    "keeps showing the approval on a %s policy",
    async (status) => {
      grant("policy.edit");
      routeDb({
        stateRow: { ...stateRow, status, review_status: "approved", review_comment: "OK" },
        usable: [workflowA],
      });

      const state = await getPolicyApprovalState({
        orgId: 1,
        policyId: 55,
        userId: 3,
        role: "Editor",
      });

      expect(state).toEqual(
        expect.objectContaining({
          review_status: "approved",
          review_comment: "OK",
          reviewed_by: 5,
          reviewed_by_name: "Grace Hopper",
          reviewed_at: stateRow.reviewed_at,
        }),
      );
    },
  );

  it("lets an Admin approve directly only when no workflow is usable", async () => {
    grant("policy.edit", "organization.admin");
    routeDb({ stateRow, usable: [] });

    const state = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 2,
      role: "Admin",
    });

    expect(state.can_submit).toBe(false);
    expect(state.can_approve_directly).toBe(true);
  });

  it("offers no action to a reader without policy.edit", async () => {
    grant();
    routeDb({ stateRow, usable: [workflowA] });

    const state = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 8,
      role: "Auditor",
    });

    expect(state.can_submit).toBe(false);
    expect(state.can_approve_directly).toBe(false);
    expect(state.can_withdraw).toBe(false);
  });

  it("while pending: no submit or approve, withdraw only for the requester", async () => {
    grant("policy.edit", "organization.admin");
    routeDb({ stateRow: { ...stateRow, status: "Under Review" }, usable: [], pending: pendingRow });

    const forRequester = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 3,
      role: "Admin",
    });
    expect(forRequester.pending_request).toMatchObject({ id: 7, requested_by: 3 });
    expect(forRequester.can_submit).toBe(false);
    expect(forRequester.can_approve_directly).toBe(false);
    expect(forRequester.can_withdraw).toBe(true);

    const forOther = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 4,
      role: "Admin",
    });
    expect(forOther.can_withdraw).toBe(false);
  });

  it.each(["Approved", "Published", "Archived", "Deprecated"])(
    "offers no submit or approve for a %s policy",
    async (status) => {
      grant("policy.edit", "organization.admin");
      routeDb({ stateRow: { ...stateRow, status }, usable: [workflowA] });
      const withWorkflow = await getPolicyApprovalState({
        orgId: 1,
        policyId: 55,
        userId: 2,
        role: "Admin",
      });
      expect(withWorkflow.can_submit).toBe(false);

      routeDb({ stateRow: { ...stateRow, status }, usable: [] });
      const withoutWorkflow = await getPolicyApprovalState({
        orgId: 1,
        policyId: 55,
        userId: 2,
        role: "Admin",
      });
      expect(withoutWorkflow.can_approve_directly).toBe(false);
    },
  );

  it("treats a missing role as no permission", async () => {
    routeDb({ stateRow, usable: [workflowA] });
    const state = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 3,
      role: undefined,
    });
    expect(state.can_submit).toBe(false);
    expect(mockRole).not.toHaveBeenCalled();
  });

  it("returns nulls for a policy never reviewed", async () => {
    grant("policy.edit");
    routeDb({
      stateRow: {
        status: "Draft",
        review_status: null,
        review_comment: null,
        reviewed_by: null,
        reviewed_at: null,
        reviewed_by_name: null,
      },
      usable: [workflowA],
    });
    const state = await getPolicyApprovalState({
      orgId: 1,
      policyId: 55,
      userId: 3,
      role: "Editor",
    });
    expect(state.reviewed_by).toBeNull();
    expect(state.reviewed_by_name).toBeNull();
  });
});

describe("assertPolicyDirectApprovalPossible", () => {
  it("passes for an Admin when no workflow is usable", async () => {
    mockRole.mockImplementation(
      async (_o: number, _r: string, key: string) => key === "organization.admin",
    );
    routeDb({ usable: [] });
    await expect(assertPolicyDirectApprovalPossible(1, "Admin")).resolves.toBeUndefined();
  });

  it("403 for a non-Admin, without reading workflows", async () => {
    routeDb({ usable: [] });
    await expect(assertPolicyDirectApprovalPossible(1, "Editor")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("409 when the organization has a usable workflow", async () => {
    mockRole.mockImplementation(
      async (_o: number, _r: string, key: string) => key === "organization.admin",
    );
    routeDb({ usable: [workflowA] });
    await expect(assertPolicyDirectApprovalPossible(1, "Admin")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mockTransactionFactory).not.toHaveBeenCalled();
  });
});

describe("rejectPendingPolicyRequestOnDelete", () => {
  it("does nothing when no request is pending", async () => {
    routeDb({ policy: draftPolicy, pending: null });
    expect(await rejectPendingPolicyRequestOnDelete(1, 55, tx as any)).toBeNull();
    expect(rejectApprovalRequestOnEntityDelete).not.toHaveBeenCalled();
  });

  it("rejects the pending request in the delete transaction and notifies after commit", async () => {
    routeDb({ policy: draftPolicy, pending: pendingRow });
    const info = {
      type: "requester_rejected",
      organizationId: 1,
      requestId: 7,
      requesterId: 3,
      requestName: "Acceptable use",
    };
    (rejectApprovalRequestOnEntityDelete as jest.Mock).mockResolvedValue(info);

    const result = await rejectPendingPolicyRequestOnDelete(1, 55, tx as any);

    expect(result).toBe(info);
    expect(rejectApprovalRequestOnEntityDelete).toHaveBeenCalledWith(
      7,
      1,
      POLICY_APPROVAL_MESSAGES.deletedReason,
      tx,
    );
    // The policy row is locked first, then the pending lookup runs, both in
    // the delete's transaction and scoped to the organization.
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    const lockAt = sqls.findIndex((q) => /FROM policy_manager[\s\S]*FOR UPDATE/.test(q));
    const lookupAt = sqls.findIndex((q) => /FROM approval_requests ar/.test(q));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(lookupAt);
    expect(sqls[lockAt]).toMatch(/organization_id = :organizationId/);
    expect(mockQuery.mock.calls[lockAt][1]).toEqual(
      expect.objectContaining({
        transaction: tx,
        replacements: expect.objectContaining({ organizationId: 1, policyId: 55 }),
      }),
    );
    expect(mockQuery.mock.calls[lookupAt][1].transaction).toBe(tx);
    // Notification waits for the commit.
    expect(notifyRequesterRejected).not.toHaveBeenCalled();
    expect(tx.afterCommit).toHaveBeenCalledTimes(1);
    tx.afterCommit.mock.calls[0][0]();
    expect(notifyRequesterRejected).toHaveBeenCalledWith(1, 3, 7, "Acceptable use", {
      rejector_name: "System",
      rejection_reason: POLICY_APPROVAL_MESSAGES.deletedReason,
    });
  });

  it("does nothing when the policy does not exist, without reading requests", async () => {
    routeDb({ policy: null, pending: pendingRow });
    expect(await rejectPendingPolicyRequestOnDelete(1, 55, tx as any)).toBeNull();
    expect(mockQuery.mock.calls.some((c) => /FROM approval_requests ar/.test(String(c[0])))).toBe(
      false,
    );
    expect(rejectApprovalRequestOnEntityDelete).not.toHaveBeenCalled();
  });
});
