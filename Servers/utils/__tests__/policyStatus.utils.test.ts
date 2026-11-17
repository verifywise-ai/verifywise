import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  assertPoliciesCanBeArchived,
  assertPolicyStatusChange,
  assertPolicyUpdateAllowed,
  getPolicyStatusChangeError,
  getPolicyTextChangeError,
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

describe("assertPolicyUpdateAllowed", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("does not query when no status is sent", async () => {
    await expect(
      assertPolicyUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: undefined,
        transaction: tx,
      }),
    ).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("locks the row in the organization and returns the stored status", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "5", title: "P", status: "Approved" }] as any)
      .mockResolvedValueOnce([] as any);
    await expect(
      assertPolicyUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: "Published",
        transaction: tx,
      }),
    ).resolves.toBe("Approved");
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("pm.organization_id = :organizationId");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).not.toContain("approval_requests");
    expect(options.replacements).toEqual({ organizationId: 1, policyIds: [5] });
    expect(options.transaction).toBe(tx);
  });

  it("checks the pending request in a second statement, after the row lock", async () => {
    // One statement would keep its pre-lock snapshot for approval_requests and
    // miss a request a concurrent submit has just committed.
    mockQuery
      .mockResolvedValueOnce([{ id: 5, title: "P", status: "Under Review" }] as any)
      .mockResolvedValueOnce([{ entity_id: "5" }] as any);
    await expect(
      assertPolicyUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: "Draft",
        transaction: tx,
      }),
    ).rejects.toThrow(POLICY_STATUS_MESSAGES.pendingRequest);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [lockSql] = mockQuery.mock.calls[0] as [string, any];
    const [pendingSql, pendingOptions] = mockQuery.mock.calls[1] as [string, any];
    expect(lockSql).toContain("FOR UPDATE");
    expect(pendingSql).toContain("FROM approval_requests");
    expect(pendingSql).toContain("ar.organization_id = :organizationId");
    expect(pendingSql).toContain("ar.entity_type = 'policy'");
    expect(pendingSql).not.toContain("FOR UPDATE");
    expect(pendingOptions.replacements).toEqual({
      organizationId: 1,
      policyIds: [5],
      pending: "Pending",
    });
    expect(pendingOptions.transaction).toBe(tx);
  });

  it("treats a null status as not sent", async () => {
    await expect(
      assertPolicyUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: null,
        transaction: tx,
      }),
    ).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects a change while a request is pending", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 5, title: "P", status: "Under Review" }] as any)
      .mockResolvedValueOnce([{ entity_id: 5 }] as any);
    await expect(
      assertPolicyUpdateAllowed({
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
      assertPolicyUpdateAllowed({
        organizationId: 1,
        policyId: 5,
        nextStatus: "Draft",
        transaction: tx,
      }),
    ).resolves.toBeNull();
  });
});

describe("getPolicyTextChangeError", () => {
  const current = { title: "Acceptable use", content_html: "<p>v1</p>" };

  it("allows anything when no request is pending", () => {
    expect(
      getPolicyTextChangeError({
        current,
        next: { title: "New", content_html: "<p>v2</p>" },
        hasPendingRequest: false,
      }),
    ).toBeNull();
  });

  it("refuses a changed title while pending", () => {
    expect(
      getPolicyTextChangeError({ current, next: { title: "New" }, hasPendingRequest: true }),
    ).toBe("title");
  });

  it("refuses changed content while pending", () => {
    expect(
      getPolicyTextChangeError({
        current,
        next: { content_html: "<p>v2</p>" },
        hasPendingRequest: true,
      }),
    ).toBe("content_html");
  });

  it("reports the title first when both change", () => {
    expect(
      getPolicyTextChangeError({
        current,
        next: { title: "New", content_html: "<p>v2</p>" },
        hasPendingRequest: true,
      }),
    ).toBe("title");
  });

  it("accepts values equal to the stored ones while pending", () => {
    expect(
      getPolicyTextChangeError({
        current,
        next: { title: "Acceptable use", content_html: "<p>v1</p>" },
        hasPendingRequest: true,
      }),
    ).toBeNull();
  });

  it("accepts values that were not sent while pending", () => {
    expect(getPolicyTextChangeError({ current, next: {}, hasPendingRequest: true })).toBeNull();
  });

  it("treats empty and missing stored content as the same text", () => {
    expect(
      getPolicyTextChangeError({
        current: { title: "T", content_html: null },
        next: { content_html: "" },
        hasPendingRequest: true,
      }),
    ).toBeNull();
  });

  it("refuses clearing the title (null) while pending", () => {
    expect(
      getPolicyTextChangeError({ current, next: { title: null }, hasPendingRequest: true }),
    ).toBe("title");
  });
});

describe("assertPolicyUpdateAllowed: title and content", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const lockRow = (pending: boolean) =>
    mockQuery
      .mockResolvedValueOnce([
        { id: 5, title: "Acceptable use", status: "Under Review", content_html: "<p>v1</p>" },
      ] as any)
      .mockResolvedValueOnce((pending ? [{ entity_id: 5 }] : []) as any);

  const call = (next: { nextTitle?: string; nextContentHtml?: string; nextStatus?: string }) =>
    assertPolicyUpdateAllowed({
      organizationId: 1,
      policyId: 5,
      nextStatus: next.nextStatus,
      nextTitle: next.nextTitle,
      nextContentHtml: next.nextContentHtml,
      transaction: tx,
    });

  it("refuses a changed title while pending with field title", async () => {
    lockRow(true);
    const error = (await call({ nextTitle: "Renamed" }).catch((e) => e)) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe(POLICY_STATUS_MESSAGES.textPendingRequest);
    expect(error.metadata?.field).toBe("title");
  });

  it("refuses changed content while pending with field content_html", async () => {
    lockRow(true);
    const error = (await call({ nextContentHtml: "<p>v2</p>" }).catch(
      (e) => e,
    )) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.metadata?.field).toBe("content_html");
  });

  it("accepts the stored title and content with an unchanged status while pending", async () => {
    lockRow(true);
    await expect(
      call({
        nextTitle: "Acceptable use",
        nextContentHtml: "<p>v1</p>",
        nextStatus: "Under Review",
      }),
    ).resolves.toBe("Under Review");
  });

  it("accepts changed text when no request is pending", async () => {
    lockRow(false);
    await expect(call({ nextTitle: "Renamed", nextContentHtml: "<p>v2</p>" })).resolves.toBe(
      "Under Review",
    );
  });

  it("locks the row in the organization, reading content, before the pending read", async () => {
    lockRow(true);
    await call({ nextContentHtml: "<p>v1</p>" });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [lockSql, lockOptions] = mockQuery.mock.calls[0] as [string, any];
    const [pendingSql, pendingOptions] = mockQuery.mock.calls[1] as [string, any];
    expect(lockSql).toContain("pm.content_html");
    expect(lockSql).toContain("pm.organization_id = :organizationId");
    expect(lockSql).toContain("FOR UPDATE");
    expect(lockOptions.replacements).toEqual({ organizationId: 1, policyIds: [5] });
    expect(lockOptions.transaction).toBe(tx);
    expect(pendingSql).toContain("FROM approval_requests");
    expect(pendingOptions.replacements.organizationId).toBe(1);
    expect(pendingOptions.transaction).toBe(tx);
  });

  it("does not read content when only the status is sent", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 5, title: "P", status: "Draft" }] as any)
      .mockResolvedValueOnce([] as any);
    await call({ nextStatus: "Archived" });
    expect(String(mockQuery.mock.calls[0][0])).not.toContain("content_html");
  });

  it("returns null when the policy is not in the organization", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await expect(call({ nextTitle: "Renamed" })).resolves.toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("assertPoliciesCanBeArchived", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("passes when nothing is pending", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, title: "A", status: "Draft" },
        { id: 2, title: "B", status: "Published" },
      ] as any)
      .mockResolvedValueOnce([] as any);
    await expect(assertPoliciesCanBeArchived(1, [1, 2], tx)).resolves.toEqual([
      { id: 1, status: "Draft" },
      { id: 2, status: "Published" },
    ]);
  });

  it("names every blocked policy, with a translatable key", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, title: "Alpha", status: "Under Review" },
        { id: 2, title: "Beta", status: "Draft" },
        { id: 3, title: "Gamma", status: "Under Review" },
      ] as any)
      .mockResolvedValueOnce([{ entity_id: 1 }, { entity_id: 3 }] as any);
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
    mockQuery
      .mockResolvedValueOnce([{ id: 1, title: "A", status: "Archived" }] as any)
      .mockResolvedValueOnce([{ entity_id: 1 }] as any);
    await expect(assertPoliciesCanBeArchived(1, [1], tx)).resolves.toEqual([
      { id: 1, status: "Archived" },
    ]);
  });

  it("locks the batch in id order before reading pending requests", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, title: "A", status: "Draft" },
        { id: 2, title: "B", status: "Draft" },
      ] as any)
      .mockResolvedValueOnce([] as any);
    await assertPoliciesCanBeArchived(1, [2, 1], tx);
    const [lockSql] = mockQuery.mock.calls[0] as [string, any];
    expect(lockSql).toMatch(/ORDER BY pm\.id\s+FOR UPDATE/);
    expect(String(mockQuery.mock.calls[1][0])).toContain("FROM approval_requests");
  });

  it("does not read pending requests when no policy row is found", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await expect(assertPoliciesCanBeArchived(1, [9], tx)).resolves.toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("does not query for an empty list", async () => {
    await expect(assertPoliciesCanBeArchived(1, [], tx)).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
