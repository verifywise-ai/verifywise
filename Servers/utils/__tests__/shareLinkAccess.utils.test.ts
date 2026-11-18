import { describe, it, expect } from "@jest/globals";
import {
  isDisableOnlyUpdate,
  pickSharedFields,
  sharePermissionFor,
  withApproverName,
} from "../shareLinkAccess.utils";

describe("sharePermissionFor", () => {
  it.each([
    ["model", "model.edit"],
    ["vendor", "vendor.edit"],
    ["project", "useCase.edit"],
    ["policy", "policy.edit"],
    ["risk", "risks.edit"],
  ])("%s needs %s", (type, key) => expect(sharePermissionFor(type)).toBe(key));

  it("has none for an unknown type", () => expect(sharePermissionFor("users")).toBeNull());
});

describe("pickSharedFields", () => {
  it("never returns a model's internal columns", () => {
    const out = pickSharedFields(
      {
        id: 1,
        model: "m",
        status: "Approved",
        organization_id: 9,
        external_key: "k",
        security_assessment_data: [{ id: 1 }],
        is_demo: false,
        mrm_tier: "Tier 1",
        mrm_tiered_by: 3,
        mrm_revalidation_reason: "x",
        approver: 4,
        approver_name: "Ada",
      },
      "model",
    );
    expect(out).toEqual({
      id: 1,
      model: "m",
      status: "Approved",
      approver: 4,
      approver_name: "Ada",
    });
  });

  it("drops a use case's people and internal columns", () => {
    const out = pickSharedFields(
      {
        id: 1,
        project_title: "p",
        organization_id: 9,
        owner: 2,
        external_owner_email: "a@b.c",
        approval_workflow_id: 5,
        type_of_high_risk_role: "deployer",
      },
      "project",
    );
    expect(out).toEqual({ id: 1, project_title: "p", type_of_high_risk_role: "deployer" });
  });

  it("returns nothing for an unknown type", () => {
    expect(pickSharedFields({ id: 1, secret: "s" }, "users")).toEqual({});
  });
});

describe("withApproverName", () => {
  it("replaces the approver id with the name", () => {
    expect(withApproverName({ id: 1, approver: 7, approver_name: "Ada Lovelace" })).toEqual({
      id: 1,
      approver: "Ada Lovelace",
    });
  });

  it.each([null, undefined, "", "  "])(
    "never sends the approver id when there is no name (%p)",
    (name) => {
      const out = withApproverName({ id: 1, approver: 7, approver_name: name });
      expect(out).toEqual({ id: 1 });
    },
  );

  it("drops a bare approver id when the record has no name column", () => {
    expect(withApproverName({ id: 1, approver: 7 })).toEqual({ id: 1 });
  });
});

describe("isDisableOnlyUpdate", () => {
  it("is true only for is_enabled: false alone", () => {
    expect(isDisableOnlyUpdate({ is_enabled: false })).toBe(true);
  });

  it.each([
    [{ is_enabled: true }],
    [{ is_enabled: false, settings: { shareAllFields: true } }],
    [{ is_enabled: false, expires_at: null }],
    [{ is_enabled: "false" }],
    [{}],
    [null],
    [undefined],
  ])("is false for %p", (body) => {
    expect(isDisableOnlyUpdate(body)).toBe(false);
  });
});
