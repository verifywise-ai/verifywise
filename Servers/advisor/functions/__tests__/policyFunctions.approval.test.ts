const mockTx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn(async () => mockTx) },
}));
jest.mock("../../../utils/policyManager.utils", () => ({ getAllPoliciesQuery: jest.fn() }));
jest.mock("../../../utils/policyTemplate.utils", () => ({ getPolicyTemplatesQuery: jest.fn() }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../services/policies/policyApproval.service", () => ({
  approvePolicyDirectly: jest.fn(),
  assertPolicyDirectApprovalPossible: jest.fn(),
  rejectPendingPolicyRequestOnDelete: jest.fn(),
  submitPolicyForApproval: jest.fn(),
}));
jest.mock("../../../utils/policyApprovalDecision.utils", () => ({
  recordPolicyStatusChange: jest.fn(),
}));
jest.mock("../../../utils/organizationMember.utils", () => ({
  getUserOrganizationsQuery: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import {
  approvePolicyDirectly,
  assertPolicyDirectApprovalPossible,
  rejectPendingPolicyRequestOnDelete,
  submitPolicyForApproval,
} from "../../../services/policies/policyApproval.service";
import { submitForApproval } from "../../approval/approvalGateway";
import { recordPolicyStatusChange } from "../../../utils/policyApprovalDecision.utils";
import { getUserOrganizationsQuery } from "../../../utils/organizationMember.utils";
import {
  ConflictException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import { POLICY_STATUS_MESSAGES } from "../../../utils/policyStatus.utils";
import { availablePolicyTools } from "../policyFunctions";

const q = sequelize.query as jest.Mock;
const exec = (name: string) => writeToolExecutors.get(name)!;

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
});

describe("agent_create_policy status", () => {
  it.each(["Under Review", "Approved", "Published"])(
    "refuses to create a policy as %s",
    async (status) => {
      await expect(
        exec("agent_create_policy")({ policy_name: "P", status, _userId: 9 }, 42),
      ).rejects.toThrow(POLICY_STATUS_MESSAGES.createStatus);
      expect(q).not.toHaveBeenCalled();
    },
  );

  it("creates a Draft by default", async () => {
    q.mockResolvedValueOnce([{ id: 1 }]);
    await exec("agent_create_policy")({ policy_name: "P", _userId: 9 }, 42);
    expect(q.mock.calls[0][1].replacements.status).toBe("Draft");
  });
});

describe("agent_update_policy status", () => {
  it("refuses a status change while a request is pending, and rolls back", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Under Review" }]);
    q.mockResolvedValueOnce([{ entity_id: 1 }]);
    await expect(
      exec("agent_update_policy")({ policy_id: 1, status: "Draft", _userId: 9 }, 42),
    ).rejects.toThrow(POLICY_STATUS_MESSAGES.pendingRequest);
    expect(q).toHaveBeenCalledTimes(2);
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });

  it("refuses to approve by hand", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Draft" }]);
    q.mockResolvedValueOnce([]);
    await expect(
      exec("agent_update_policy")({ policy_id: 1, status: "Approved", _userId: 9 }, 42),
    ).rejects.toThrow(POLICY_STATUS_MESSAGES.approvedByHand);
  });

  it("publishes an approved policy and records the status change", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Approved" }]);
    q.mockResolvedValueOnce([]);
    q.mockResolvedValueOnce([{ id: 1, status: "Published" }]);
    const result = await exec("agent_update_policy")(
      { policy_id: 1, status: "Published", _userId: 9 },
      42,
    );
    expect(result).toEqual({ id: 1, status: "Published" });
    expect(q.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(q.mock.calls[1][0]).toContain("FROM approval_requests");
    expect(q.mock.calls[2][1].transaction).toBe(mockTx);
    expect(recordPolicyStatusChange).toHaveBeenCalledWith(
      42,
      1,
      9,
      "Approved",
      "Published",
      mockTx,
    );
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("treats a null status as not sent: not written, not checked, no history", async () => {
    q.mockResolvedValueOnce([{ id: 1 }]);
    await exec("agent_update_policy")(
      { policy_id: 1, review_date: "2027-01-01", status: null, _userId: 9 },
      42,
    );
    expect(q).toHaveBeenCalledTimes(1);
    const [sql, options] = q.mock.calls[0];
    expect(sql).not.toContain("status = :status");
    expect(options.replacements).not.toHaveProperty("status");
    expect(recordPolicyStatusChange).not.toHaveBeenCalled();
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("rejects a status outside the policy statuses before opening a transaction", async () => {
    expect.assertions(4);
    try {
      await exec("agent_update_policy")({ policy_id: 1, status: "Bogus", _userId: 9 }, 42);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      expect((error as Error).message).toBe("Choose a valid status");
      expect((error as ValidationException).metadata.field).toBe("status");
      expect(q).not.toHaveBeenCalled();
    }
  });

  it("does not check or record status when none is sent", async () => {
    q.mockResolvedValueOnce([{ id: 1 }]);
    await exec("agent_update_policy")({ policy_id: 1, review_date: "2027-01-01", _userId: 9 }, 42);
    expect(q).toHaveBeenCalledTimes(1);
    expect(recordPolicyStatusChange).not.toHaveBeenCalled();
  });
});

describe("agent_update_policy title and content while a request is pending", () => {
  const lockRow = (hasPending: boolean) => {
    q.mockResolvedValueOnce([
      { id: 1, title: "Acceptable use", status: "Under Review", content_html: "<p>v1</p>" },
    ]);
    q.mockResolvedValueOnce(hasPending ? [{ entity_id: 1 }] : []);
  };

  it("refuses a new title with field title, writes nothing and rolls back", async () => {
    lockRow(true);
    const error = (await exec("agent_update_policy")(
      { policy_id: 1, policy_name: "Renamed", _userId: 9 },
      42,
    ).catch((e: unknown) => e)) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe(POLICY_STATUS_MESSAGES.textPendingRequest);
    expect(error.metadata.field).toBe("title");
    expect(q).toHaveBeenCalledTimes(2);
    expect(String(q.mock.calls[0][0])).toContain("FOR UPDATE");
    expect(q.mock.calls[0][1].replacements).toEqual({ organizationId: 42, policyIds: [1] });
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });

  it("refuses new content with field content_html", async () => {
    lockRow(true);
    const error = (await exec("agent_update_policy")(
      { policy_id: 1, description: "<p>v2</p>", _userId: 9 },
      42,
    ).catch((e: unknown) => e)) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.metadata.field).toBe("content_html");
    expect(mockTx.rollback).toHaveBeenCalled();
  });

  it("updates other fields with the stored title", async () => {
    lockRow(true);
    q.mockResolvedValueOnce([{ id: 1 }]);
    await exec("agent_update_policy")(
      { policy_id: 1, policy_name: "Acceptable use", tags: ["AI ethics"], _userId: 9 },
      42,
    );
    expect(q).toHaveBeenCalledTimes(3);
    expect(String(q.mock.calls[2][0])).toContain("UPDATE policy_manager");
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("changes the title when no request is pending", async () => {
    lockRow(false);
    q.mockResolvedValueOnce([{ id: 1, title: "Renamed" }]);
    await exec("agent_update_policy")({ policy_id: 1, policy_name: "Renamed", _userId: 9 }, 42);
    expect(q.mock.calls[2][1].replacements.title).toBe("Renamed");
    expect(mockTx.commit).toHaveBeenCalled();
  });
});

describe("agent_submit_policy_for_review", () => {
  it("submits through the approval service with the optional workflow", async () => {
    (submitPolicyForApproval as jest.Mock).mockResolvedValue({
      request_id: 3,
      policy: { id: 1, status: "Under Review" },
    });
    const result = await exec("agent_submit_policy_for_review")(
      { policy_id: 1, workflow_id: 6, _userId: 9 },
      42,
    );
    expect(submitPolicyForApproval).toHaveBeenCalledWith({
      orgId: 42,
      policyId: 1,
      userId: 9,
      workflowId: 6,
    });
    expect(result).toEqual({ id: 1, status: "Under Review" });
    expect(q).not.toHaveBeenCalled();
  });

  it("surfaces the service's error", async () => {
    (submitPolicyForApproval as jest.Mock).mockRejectedValue(
      new ConflictException("This policy already has a pending approval request"),
    );
    await expect(
      exec("agent_submit_policy_for_review")({ policy_id: 1, _userId: 9 }, 42),
    ).rejects.toThrow("This policy already has a pending approval request");
    expect((submitPolicyForApproval as jest.Mock).mock.calls[0][0].workflowId).toBeUndefined();
  });
});

describe("agent_approve_policy_review", () => {
  it("approves directly with the acting user's role in this organization", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([
      { organization_id: 7, role_name: "Editor" },
      { organization_id: 42, role_name: "Admin" },
    ]);
    (approvePolicyDirectly as jest.Mock).mockResolvedValue({ id: 1, status: "Approved" });
    const result = await exec("agent_approve_policy_review")(
      { policy_id: 1, approval_notes: "ok", _userId: 9 },
      42,
    );
    expect(approvePolicyDirectly).toHaveBeenCalledWith({
      orgId: 42,
      policyId: 1,
      userId: 9,
      role: "Admin",
      comment: "ok",
    });
    expect(result).toEqual({ id: 1, status: "Approved" });
  });

  it("passes no role when the user is not a member, so the service refuses", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([
      { organization_id: 7, role_name: "Admin" },
    ]);
    (approvePolicyDirectly as jest.Mock).mockRejectedValue(
      new Error("Only an Admin can approve a policy directly"),
    );
    await expect(
      exec("agent_approve_policy_review")({ policy_id: 1, _userId: 9 }, 42),
    ).rejects.toThrow("Only an Admin can approve a policy directly");
    expect((approvePolicyDirectly as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ role: undefined, comment: null }),
    );
  });

  it("surfaces 'use the approval workflow' when the organization has one", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([
      { organization_id: 42, role_name: "Admin" },
    ]);
    (approvePolicyDirectly as jest.Mock).mockRejectedValue(
      new ConflictException("Use the approval workflow"),
    );
    await expect(
      exec("agent_approve_policy_review")({ policy_id: 1, _userId: 9 }, 42),
    ).rejects.toThrow("Use the approval workflow");
  });
});

describe("agent_approve_policy_review before the approval gate", () => {
  const callTool = (params: Record<string, unknown>) =>
    availablePolicyTools.agent_approve_policy_review(params, 42);

  it("refuses a non-Admin before anything is queued for sign-off", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([
      { organization_id: 42, role_name: "Editor" },
    ]);
    (assertPolicyDirectApprovalPossible as jest.Mock).mockRejectedValue(
      new Error("Only an Admin can approve a policy directly"),
    );

    await expect(callTool({ policy_id: 1, _userId: 9 })).rejects.toThrow(
      "Only an Admin can approve a policy directly",
    );
    expect(assertPolicyDirectApprovalPossible).toHaveBeenCalledWith(42, "Editor");
    expect(submitForApproval).not.toHaveBeenCalled();
  });

  it("queues an Admin's direct approval through the gate", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([
      { organization_id: 42, role_name: "Admin" },
    ]);
    (assertPolicyDirectApprovalPossible as jest.Mock).mockResolvedValue(undefined);
    const pending = { confirmation_required: true, confirmation_id: "a1" };
    (submitForApproval as jest.Mock).mockResolvedValue({
      outcome: "pending",
      approvalId: "a1",
      confirmationResult: pending,
    });

    await expect(callTool({ policy_id: 1, _userId: 9 })).resolves.toBe(pending);
    expect(assertPolicyDirectApprovalPossible).toHaveBeenCalledWith(42, "Admin");
    expect(submitForApproval).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "agent_approve_policy_review", userId: 9 }),
    );
  });
});

describe("agent_delete_policy", () => {
  it("rejects the pending request inside the delete transaction", async () => {
    q.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ id: 1 }]);
    const result = await exec("agent_delete_policy")({ policy_id: 1, _userId: 9 }, 42);
    expect(rejectPendingPolicyRequestOnDelete).toHaveBeenCalledWith(42, 1, mockTx);
    for (const call of q.mock.calls) expect(call[1].transaction).toBe(mockTx);
    expect(mockTx.commit).toHaveBeenCalled();
    expect(result).toEqual({ policy_id: 1, deleted: true });
  });

  it("rolls back when the policy is not found", async () => {
    q.mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    await expect(exec("agent_delete_policy")({ policy_id: 1, _userId: 9 }, 42)).rejects.toThrow(
      "Policy #1 not found",
    );
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });
});
