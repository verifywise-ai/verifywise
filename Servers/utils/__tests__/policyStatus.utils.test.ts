import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  assertPoliciesCanBeArchived,
  assertPolicyStatusChange,
  assertPolicyStatusUpdateAllowed,
  getPolicyStatusChangeError,
  POLICY_CREATE_STATUSES,
  POLICY_STATUS_MESSAGES,
} from "../policyStatus.utils";
import {
  findInvalidPolicyStatusTransition,
  POLICY_INVALID_STATUS_TRANSITIONS,
  validatePolicyUpdateBusinessRules,
} from "../validations/policiesValidation.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const tx = { id: "tx" } as any;

describe("getPolicyStatusChangeError: create", () => {
  it("defaults to Draft when no status is sent", () => {
    expect(getPolicyStatusChangeError({ currentStatus: null, nextStatus: undefined })).toBeNull();
  });

  it.each(["Draft", "Archived", "Deprecated"])("accepts %s", (status) => {
    expect(getPolicyStatusChangeError({ currentStatus: null, nextStatus: status })).toBeNull();
  });

  it.each(["Under Review", "Approved", "Published"])("rejects %s", (status) => {
    expect(getPolicyStatusChangeError({ currentStatus: null, nextStatus: status })).toBe(
      POLICY_STATUS_MESSAGES.createStatus,
    );
  });

  it("lists the create statuses", () => {
    expect(POLICY_CREATE_STATUSES).toEqual(["Draft", "Archived", "Deprecated"]);
  });
});

describe("getPolicyStatusChangeError: update", () => {
  it.each(["Draft", "Under Review", "Approved", "Published", "Archived", "Deprecated"])(
    "never rejects an unchanged %s, even with a pending request",
    (status) => {
      expect(
        getPolicyStatusChangeError({
          currentStatus: status,
          nextStatus: status,
          hasPendingRequest: true,
        }),
      ).toBeNull();
    },
  );

  it("accepts a status that was not sent", () => {
    expect(
      getPolicyStatusChangeError({
        currentStatus: "Draft",
        nextStatus: undefined,
        hasPendingRequest: true,
      }),
    ).toBeNull();
  });

  it("rejects any change while a request is pending, before the other rules", () => {
    expect(
      getPolicyStatusChangeError({
        currentStatus: "Under Review",
        nextStatus: "Archived",
        hasPendingRequest: true,
      }),
    ).toBe(POLICY_STATUS_MESSAGES.pendingRequest);
  });

  it.each([
    ["Draft", "Under Review", POLICY_STATUS_MESSAGES.underReviewByHand],
    ["Approved", "Under Review", POLICY_STATUS_MESSAGES.underReviewByHand],
    ["Draft", "Approved", POLICY_STATUS_MESSAGES.approvedByHand],
    ["Under Review", "Approved", POLICY_STATUS_MESSAGES.approvedByHand],
    ["Draft", "Published", POLICY_STATUS_MESSAGES.publishNotApproved],
    ["Under Review", "Published", POLICY_STATUS_MESSAGES.publishNotApproved],
    ["Deprecated", "Published", POLICY_STATUS_MESSAGES.publishNotApproved],
    ["Published", "Draft", "Cannot move published policy back to draft"],
    ["Archived", "Draft", "Cannot restore archived policy to draft"],
  ])("rejects %s → %s", (from, to, message) => {
    expect(getPolicyStatusChangeError({ currentStatus: from, nextStatus: to })).toBe(message);
  });

  it.each([
    ["Approved", "Published"],
    ["Approved", "Draft"],
    ["Under Review", "Draft"],
    ["Draft", "Archived"],
    ["Published", "Archived"],
    ["Published", "Deprecated"],
    ["Archived", "Deprecated"],
    ["Deprecated", "Archived"],
    ["Deprecated", "Draft"],
    // Legacy values are taken as they are stored.
    ["in review", "Draft"],
  ])("accepts %s → %s", (from, to) => {
    expect(getPolicyStatusChangeError({ currentStatus: from, nextStatus: to })).toBeNull();
  });
});

describe("assertPolicyStatusChange", () => {
  it("throws a ValidationException on the status field", () => {
    expect.assertions(3);
    try {
      assertPolicyStatusChange({ currentStatus: "Draft", nextStatus: "Approved" });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      expect((error as ValidationException).metadata.field).toBe("status");
      expect((error as Error).message).toBe(POLICY_STATUS_MESSAGES.approvedByHand);
    }
  });

  it("passes an allowed change", () => {
    expect(() =>
      assertPolicyStatusChange({ currentStatus: "Approved", nextStatus: "Published" }),
    ).not.toThrow();
  });
});

describe("transition table", () => {
  it("keeps the six forbidden transitions", () => {
    expect(POLICY_INVALID_STATUS_TRANSITIONS.map((t) => `${t.from}->${t.to}`)).toEqual([
      "Published->Draft",
      "Published->Under Review",
      "Archived->Draft",
      "Archived->Under Review",
      "Archived->Approved",
      "Deprecated->Published",
    ]);
    expect(findInvalidPolicyStatusTransition("Draft", "Archived")).toBeUndefined();
  });

  it("still drives validatePolicyUpdateBusinessRules", () => {
    const errors = validatePolicyUpdateBusinessRules({ status: "Draft" }, { status: "Published" });
    expect(errors).toEqual([
      expect.objectContaining({ field: "status", code: "INVALID_STATUS_TRANSITION" }),
    ]);
  });
});

describe("assertPolicyStatusUpdateAllowed", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("does not query when no status is sent", async () => {
    await expect(
      assertPolicyStatusUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: undefined,
        transaction: tx,
      }),
    ).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("locks the row in the organization and returns the stored status", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "5", title: "P", status: "Approved", has_pending: false },
    ] as any);
    await expect(
      assertPolicyStatusUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: "Published",
        transaction: tx,
      }),
    ).resolves.toBe("Approved");
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("pm.organization_id = :organizationId");
    expect(sql).toContain("ar.entity_type = 'policy'");
    expect(sql).toContain("FOR UPDATE OF pm");
    expect(options.replacements).toEqual({ organizationId: 1, policyIds: [5], pending: "Pending" });
    expect(options.transaction).toBe(tx);
  });

  it("rejects a change while a request is pending", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 5, title: "P", status: "Under Review", has_pending: true },
    ] as any);
    await expect(
      assertPolicyStatusUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: "Draft",
        transaction: tx,
      }),
    ).rejects.toThrow(POLICY_STATUS_MESSAGES.pendingRequest);
  });

  it("returns null when the policy is not in the organization", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await expect(
      assertPolicyStatusUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: "Draft",
        transaction: tx,
      }),
    ).resolves.toBeNull();
  });
});

describe("assertPoliciesCanBeArchived", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("passes when nothing is pending", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, title: "A", status: "Draft", has_pending: false },
      { id: 2, title: "B", status: "Published", has_pending: false },
    ] as any);
    await expect(assertPoliciesCanBeArchived(1, [1, 2], tx)).resolves.toBeUndefined();
  });

  it("names every blocked policy, with a translatable key", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, title: "Alpha", status: "Under Review", has_pending: true },
      { id: 2, title: "Beta", status: "Draft", has_pending: false },
      { id: 3, title: "Gamma", status: "Under Review", has_pending: true },
    ] as any);
    expect.assertions(4);
    try {
      await assertPoliciesCanBeArchived(1, [1, 2, 3], tx);
    } catch (error) {
      const e = error as ValidationException;
      expect(e.message).toBe(
        'Withdraw the approval request before archiving these policies: "Alpha", "Gamma"',
      );
      expect(e.i18nKey).toBe(POLICY_STATUS_MESSAGES.bulkArchivePending);
      expect(e.i18nVars).toEqual({ policies: '"Alpha", "Gamma"' });
      expect(e.metadata.field).toBe("status");
    }
  });

  it("accepts a policy that is already archived even with a pending request", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, title: "A", status: "Archived", has_pending: true },
    ] as any);
    await expect(assertPoliciesCanBeArchived(1, [1], tx)).resolves.toBeUndefined();
  });

  it("does not query for an empty list", async () => {
    await expect(assertPoliciesCanBeArchived(1, [], tx)).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
