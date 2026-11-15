import { describe, expect, it } from "vitest";
import { isPolicyFormDirty, policyOwnerIdToSave } from "../policyFormDirty";
import type { PolicyFormData } from "../../../../types/interfaces/i.policy";
import type { PolicyManagerModel } from "../../../../../domain/models/Common/policy/policyManager.model";

const policy = {
  id: 1,
  title: "AI use",
  status: "Draft",
  tags: ["Privacy", "AI ethics"],
  next_review_date: "2026-12-01T00:00:00.000Z",
  policy_owner_id: 2,
  assigned_reviewer_ids: [3, 4, 99],
  content_html: "<p>old</p>",
} as unknown as PolicyManagerModel;

const user = (id: number) => ({ id, name: "U", surname: String(id), email: `${id}@x.io` });

const clean: PolicyFormData = {
  title: "AI use",
  status: "Draft",
  tags: ["AI ethics", "Privacy"],
  nextReviewDate: "2026-12-01",
  policyOwner: user(2) as PolicyFormData["policyOwner"],
  // 99 is not a known user, so the form never shows it.
  assignedReviewers: [user(4), user(3)] as PolicyFormData["assignedReviewers"],
  content: "<p>saved</p>",
};

const knownUserIds = new Set([2, 3, 4]);
const check = (formData: PolicyFormData) =>
  isPolicyFormDirty({ policy, formData, knownUserIds, savedContent: "<p>saved</p>" });

describe("isPolicyFormDirty", () => {
  it("is clean when the form matches the saved policy, whatever the order", () => {
    expect(check(clean)).toBe(false);
  });

  it.each([
    ["title", { title: "Other" }],
    ["status", { status: "Archived" }],
    ["tags", { tags: ["Privacy"] }],
    ["review date", { nextReviewDate: "2027-01-01" }],
    ["owner", { policyOwner: null }],
    ["team members", { assignedReviewers: [user(3)] as PolicyFormData["assignedReviewers"] }],
    ["content", { content: "<p>edited</p>" }],
  ])("is dirty when the %s changed", (_label, change) => {
    expect(check({ ...clean, ...change })).toBe(true);
  });

  it("treats a missing status as draft", () => {
    const noStatus = { ...policy, status: "" } as PolicyManagerModel;
    expect(
      isPolicyFormDirty({
        policy: noStatus,
        formData: clean,
        knownUserIds,
        savedContent: "<p>saved</p>",
      }),
    ).toBe(false);
  });

  it("is clean when the saved owner is not in the user list and the owner field is empty", () => {
    // The editor seeds the owner as empty when it cannot show them.
    const unknownOwner = { ...policy, policy_owner_id: 77 } as PolicyManagerModel;
    expect(
      isPolicyFormDirty({
        policy: unknownOwner,
        formData: { ...clean, policyOwner: null },
        knownUserIds,
        savedContent: "<p>saved</p>",
      }),
    ).toBe(false);
  });
});

describe("policyOwnerIdToSave", () => {
  const withOwner = (id: number | null) =>
    ({ ...policy, policy_owner_id: id }) as PolicyManagerModel;

  it("sends the picked owner", () => {
    expect(policyOwnerIdToSave({ policy: withOwner(77), formOwnerId: 3, knownUserIds })).toBe(3);
  });

  it("clears an owner the user list knows when the field is emptied", () => {
    expect(policyOwnerIdToSave({ policy: withOwner(2), formOwnerId: null, knownUserIds })).toBe(
      null,
    );
  });

  it("leaves out an owner the field could not show, so saving keeps them", () => {
    expect(
      policyOwnerIdToSave({ policy: withOwner(77), formOwnerId: null, knownUserIds }),
    ).toBeUndefined();
  });

  it("sends null for a new policy with no owner", () => {
    expect(policyOwnerIdToSave({ policy: null, formOwnerId: null, knownUserIds })).toBe(null);
  });
});
