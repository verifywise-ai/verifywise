import { describe, it, expect } from "@jest/globals";
import { sharePermissionFor, pickSharedFields } from "../shareLinkAccess.utils";

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
