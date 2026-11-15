const mockTx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn(async () => mockTx) },
}));
jest.mock("../../../utils/policyManager.utils", () => ({
  getAllPoliciesQuery: jest.fn(),
  deletePolicyByIdQuery: jest.fn(),
  createPolicyQuery: jest.fn(),
  getPolicyByIdQuery: jest.fn(),
  updatePolicyByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/policyChangeHistory.utils", () => ({ recordPolicyCreation: jest.fn() }));
jest.mock("../../../utils/changeHistory.base.utils", () => ({ recordUpdateChanges: jest.fn() }));
jest.mock("../../../config/changeHistory.config", () => ({
  runInSavepoint: jest.fn(async (work: () => Promise<unknown>) => work()),
}));
jest.mock("../../../utils/policyTemplate.utils", () => ({ getPolicyTemplatesQuery: jest.fn() }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../services/policies/policyApproval.service", () => ({
  approvePolicyDirectly: jest.fn(),
  assertPolicyDirectApprovalPossible: jest.fn(),
  getPolicyApprovalState: jest.fn(),
  rejectPendingPolicyRequestOnDelete: jest.fn(),
  submitPolicyForApproval: jest.fn(),
}));
jest.mock("../../../utils/organizationMember.utils", () => ({
  getUserOrganizationsQuery: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import {
  approvePolicyDirectly,
  assertPolicyDirectApprovalPossible,
  getPolicyApprovalState,
  rejectPendingPolicyRequestOnDelete,
  submitPolicyForApproval,
} from "../../../services/policies/policyApproval.service";
import { submitForApproval } from "../../approval/approvalGateway";
import { recordPolicyCreation } from "../../../utils/policyChangeHistory.utils";
import { recordUpdateChanges } from "../../../utils/changeHistory.base.utils";
import { getUserOrganizationsQuery } from "../../../utils/organizationMember.utils";
import {
  ConflictException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import { POLICY_STATUS_MESSAGES } from "../../../utils/policyStatus.utils";
import {
  createPolicyQuery,
  deletePolicyByIdQuery,
  getPolicyByIdQuery,
  updatePolicyByIdQuery,
} from "../../../utils/policyManager.utils";
import { availablePolicyTools } from "../policyFunctions";

const q = sequelize.query as jest.Mock;
const mockCreate = createPolicyQuery as jest.Mock;
const mockGetById = getPolicyByIdQuery as jest.Mock;
const mockUpdate = updatePolicyByIdQuery as jest.Mock;
const exec = (name: string) => writeToolExecutors.get(name)!;

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
});

describe("agent_create_policy", () => {
  it.each(["Under Review", "Approved", "Published"])(
    "refuses to create a policy as %s",
    async (status) => {
      await expect(
        exec("agent_create_policy")({ policy_name: "P", status, _userId: 9 }, 42),
      ).rejects.toThrow(POLICY_STATUS_MESSAGES.createStatus);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(sequelize.transaction).not.toHaveBeenCalled();
    },
  );

  it("creates a Draft through createPolicyQuery and records the creation, on one transaction", async () => {
    mockCreate.mockResolvedValueOnce({ id: 5, title: "P", status: "Draft" });
    const result = await exec("agent_create_policy")(
      { policy_name: "P", tags: [], review_date: "2027-01-01", _userId: 9 },
      42,
    );
    expect(result).toEqual({ id: 5, title: "P", status: "Draft" });
    const [data, orgId, userId, tx] = mockCreate.mock.calls[0];
    expect(data).toEqual(
      expect.objectContaining({
        title: "P",
        content_html: "",
        status: "Draft",
        tags: [],
        next_review_date: "2027-01-01",
        author_id: 9,
        last_updated_by: 9,
      }),
    );
    expect([orgId, userId, tx]).toEqual([42, 9, mockTx]);
    expect(recordPolicyCreation).toHaveBeenCalledWith(5, 9, 42, data, mockTx);
    expect(q).not.toHaveBeenCalled();
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("refuses an unknown tag as the REST create does, before opening a transaction", async () => {
    const error = (await exec("agent_create_policy")(
      { policy_name: "P", tags: ["Not a tag"], _userId: 9 },
      42,
    ).catch((e: unknown) => e)) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe("Choose tags from the list");
    expect(error.metadata.field).toBe("tags");
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty title", ""],
    ["a blank title", "   "],
    ["a title over 255 characters", "x".repeat(256)],
  ])("refuses %s as the REST create does", async (_label, title) => {
    const error = (await exec("agent_create_policy")({ policy_name: title, _userId: 9 }, 42).catch(
      (e: unknown) => e,
    )) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe("Enter a title of up to 255 characters");
    expect(error.metadata.field).toBe("title");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses an invalid review date as the REST create does", async () => {
    await expect(
      exec("agent_create_policy")({ policy_name: "P", review_date: "next week", _userId: 9 }, 42),
    ).rejects.toThrow("Enter a valid next review date");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rolls back when createPolicyQuery refuses (e.g. an owner outside the organization)", async () => {
    mockCreate.mockRejectedValueOnce(new ValidationException("x", "policy_owner_id", 1));
    await expect(exec("agent_create_policy")({ policy_name: "P", _userId: 9 }, 42)).rejects.toThrow(
      "x",
    );
    expect(recordPolicyCreation).not.toHaveBeenCalled();
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });

  it("keeps the policy when the creation history fails", async () => {
    mockCreate.mockResolvedValueOnce({ id: 5 });
    (recordPolicyCreation as jest.Mock).mockRejectedValueOnce(new Error("history down"));
    await expect(
      exec("agent_create_policy")({ policy_name: "P", _userId: 9 }, 42),
    ).resolves.toEqual({ id: 5 });
    expect(mockTx.commit).toHaveBeenCalled();
    expect(mockTx.rollback).not.toHaveBeenCalled();
  });

  it("writes no history without an acting user", async () => {
    mockCreate.mockResolvedValueOnce({ id: 5 });
    await exec("agent_create_policy")({ policy_name: "P" }, 42);
    expect(recordPolicyCreation).not.toHaveBeenCalled();
    expect(mockTx.commit).toHaveBeenCalled();
  });
});

describe("agent_update_policy status", () => {
  const stored = { id: 1, title: "P", status: "Approved", tags: [], assigned_reviewer_ids: [] };

  it("refuses a status change while a request is pending, and rolls back", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Under Review" }]);
    q.mockResolvedValueOnce([{ entity_id: 1 }]);
    await expect(
      exec("agent_update_policy")({ policy_id: 1, status: "Draft", _userId: 9 }, 42),
    ).rejects.toThrow(POLICY_STATUS_MESSAGES.pendingRequest);
    expect(q).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });

  it("refuses to approve by hand", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Draft" }]);
    q.mockResolvedValueOnce([]);
    await expect(
      exec("agent_update_policy")({ policy_id: 1, status: "Approved", _userId: 9 }, 42),
    ).rejects.toThrow(POLICY_STATUS_MESSAGES.approvedByHand);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("publishes an approved policy through updatePolicyByIdQuery and records the change", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Approved" }]);
    q.mockResolvedValueOnce([]);
    mockGetById.mockResolvedValueOnce([stored]);
    mockUpdate.mockResolvedValueOnce({ id: 1, status: "Published" });
    const result = await exec("agent_update_policy")(
      { policy_id: 1, status: "Published", _userId: 9 },
      42,
    );
    expect(result).toEqual({ id: 1, status: "Published" });
    expect(q.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(q.mock.calls[1][0]).toContain("FROM approval_requests");
    // The stored row is read after the lock, on the update's transaction.
    expect(mockGetById).toHaveBeenCalledWith(42, 1, mockTx);
    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      { status: "Published", last_updated_by: 9 },
      42,
      9,
      mockTx,
    );
    expect(recordUpdateChanges).toHaveBeenCalledWith(
      "policy",
      1,
      stored,
      { status: "Published", last_updated_by: 9 },
      9,
      42,
      mockTx,
    );
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("treats a null status as not sent: not written, not checked", async () => {
    mockGetById.mockResolvedValueOnce([stored]);
    mockUpdate.mockResolvedValueOnce({ id: 1 });
    await exec("agent_update_policy")(
      { policy_id: 1, review_date: "2027-01-01", status: null, _userId: 9 },
      42,
    );
    expect(q).not.toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("status");
    expect(mockUpdate.mock.calls[0][1].next_review_date).toBe("2027-01-01");
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("rejects a status outside the policy statuses before opening a transaction", async () => {
    expect.assertions(5);
    try {
      await exec("agent_update_policy")({ policy_id: 1, status: "Bogus", _userId: 9 }, 42);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      expect((error as Error).message).toBe("Choose a valid status");
      expect((error as ValidationException).metadata.field).toBe("status");
      expect(q).not.toHaveBeenCalled();
      expect(sequelize.transaction).not.toHaveBeenCalled();
    }
  });

  it("rolls back and writes nothing when the policy is not in the organization", async () => {
    q.mockResolvedValueOnce([]);
    q.mockResolvedValueOnce([]);
    mockGetById.mockResolvedValueOnce([]);
    await expect(
      exec("agent_update_policy")({ policy_id: 1, status: "Archived", _userId: 9 }, 42),
    ).rejects.toThrow("Policy #1 not found");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(recordUpdateChanges).not.toHaveBeenCalled();
    expect(mockTx.rollback).toHaveBeenCalled();
  });
});

describe("agent_update_policy fields and history", () => {
  const stored = {
    id: 1,
    title: "P",
    status: "Draft",
    content_html: "<p>v1</p>",
    tags: ["Privacy"],
    assigned_reviewer_ids: [],
  };

  it("updates tags through the shared query and records the field history", async () => {
    mockGetById.mockResolvedValueOnce([stored]);
    mockUpdate.mockResolvedValueOnce({ id: 1, tags: ["Privacy", "Audit"] });
    await exec("agent_update_policy")(
      { policy_id: 1, tags: ["Privacy", "Audit"], review_date: "2027-03-01", _userId: 9 },
      42,
    );
    // No status, title or content: the gate takes no lock, as in the REST update.
    expect(q).not.toHaveBeenCalled();
    const written = {
      tags: ["Privacy", "Audit"],
      next_review_date: "2027-03-01",
      last_updated_by: 9,
    };
    expect(mockUpdate).toHaveBeenCalledWith(1, written, 42, 9, mockTx);
    expect(recordUpdateChanges).toHaveBeenCalledWith("policy", 1, stored, written, 9, 42, mockTx);
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("refuses an unknown tag before opening a transaction", async () => {
    await expect(
      exec("agent_update_policy")({ policy_id: 1, tags: ["Nope"], _userId: 9 }, 42),
    ).rejects.toThrow("Choose tags from the list");
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it("does not track content that sanitizes to empty, as it is not written", async () => {
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Draft", content_html: "<p>v1</p>" }]);
    q.mockResolvedValueOnce([]);
    mockGetById.mockResolvedValueOnce([stored]);
    mockUpdate.mockResolvedValueOnce({ id: 1 });
    await exec("agent_update_policy")(
      { policy_id: 1, description: "<script>alert(1)</script>", status: "Draft", _userId: 9 },
      42,
    );
    const tracked = (recordUpdateChanges as jest.Mock).mock.calls[0][3];
    expect(tracked).not.toHaveProperty("content_html");
    expect(tracked.status).toBe("Draft");
  });

  it("writes no history without an acting user", async () => {
    mockGetById.mockResolvedValueOnce([stored]);
    mockUpdate.mockResolvedValueOnce({ id: 1 });
    await exec("agent_update_policy")({ policy_id: 1, tags: ["Audit"] }, 42);
    expect(recordUpdateChanges).not.toHaveBeenCalled();
    expect(mockTx.commit).toHaveBeenCalled();
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
    expect(mockUpdate).not.toHaveBeenCalled();
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
    mockGetById.mockResolvedValueOnce([{ id: 1, title: "Acceptable use" }]);
    mockUpdate.mockResolvedValueOnce({ id: 1 });
    await exec("agent_update_policy")(
      { policy_id: 1, policy_name: "Acceptable use", tags: ["AI ethics"], _userId: 9 },
      42,
    );
    expect(q).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("changes the title when no request is pending", async () => {
    lockRow(false);
    mockGetById.mockResolvedValueOnce([{ id: 1, title: "Acceptable use" }]);
    mockUpdate.mockResolvedValueOnce({ id: 1, title: "Renamed" });
    await exec("agent_update_policy")({ policy_id: 1, policy_name: "Renamed", _userId: 9 }, 42);
    expect(mockUpdate.mock.calls[0][1].title).toBe("Renamed");
    expect(mockTx.commit).toHaveBeenCalled();
  });
});

describe("get_policy_review_status", () => {
  const callTool = (params: Record<string, unknown>, userId?: number) =>
    (availablePolicyTools.get_policy_review_status as Function)(params, 42, userId);

  it("reads the approval state for this organization with the acting user's role", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([
      { organization_id: 7, role_name: "Admin" },
      { organization_id: 42, role_name: "Editor" },
    ]);
    const state = { pending_request: null, can_submit: true };
    (getPolicyApprovalState as jest.Mock).mockResolvedValue(state);
    await expect(callTool({ policy_id: 3, _userId: 9 }, 9)).resolves.toBe(state);
    expect(getPolicyApprovalState).toHaveBeenCalledWith({
      orgId: 42,
      policyId: 3,
      userId: 9,
      role: "Editor",
    });
    // A read: nothing is queued for sign-off.
    expect(submitForApproval).not.toHaveBeenCalled();
  });

  it("surfaces the service's not-found for a policy outside the organization", async () => {
    (getUserOrganizationsQuery as jest.Mock).mockResolvedValue([]);
    (getPolicyApprovalState as jest.Mock).mockRejectedValue(new Error("Policy not found"));
    await expect(callTool({ policy_id: 3, _userId: 9 })).rejects.toThrow("Policy not found");
    expect((getPolicyApprovalState as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ orgId: 42, role: undefined }),
    );
  });

  it.each([undefined, 0, -1, 1.5, "abc"])("refuses policy_id %p", async (policyId) => {
    await expect(callTool({ policy_id: policyId, _userId: 9 })).rejects.toThrow(
      "Invalid policy ID",
    );
    expect(getPolicyApprovalState).not.toHaveBeenCalled();
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
  const mockDeleteQuery = deletePolicyByIdQuery as jest.Mock;

  it("rejects the pending request, then deletes through the shared query on one transaction", async () => {
    mockDeleteQuery.mockResolvedValueOnce(true);
    const result = await exec("agent_delete_policy")({ policy_id: 1, _userId: 9 }, 42);
    expect(rejectPendingPolicyRequestOnDelete).toHaveBeenCalledWith(42, 1, mockTx);
    expect(mockDeleteQuery).toHaveBeenCalledWith(42, 1, 9, mockTx);
    expect(q).not.toHaveBeenCalled();
    expect(mockTx.commit).toHaveBeenCalled();
    expect(result).toEqual({ policy_id: 1, deleted: true });
  });

  it("deletes without a history user when _userId is missing", async () => {
    mockDeleteQuery.mockResolvedValueOnce(true);
    await exec("agent_delete_policy")({ policy_id: 1 }, 42);
    expect(mockDeleteQuery).toHaveBeenCalledWith(42, 1, null, mockTx);
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("rolls back when the policy is not found", async () => {
    mockDeleteQuery.mockResolvedValueOnce(false);
    await expect(exec("agent_delete_policy")({ policy_id: 1, _userId: 9 }, 42)).rejects.toThrow(
      "Policy #1 not found",
    );
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });
});
