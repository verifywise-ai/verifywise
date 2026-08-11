import { reportScopeErrors } from "../reportAuthorization";

describe("reportScopeErrors", () => {
  it("lets Admin do anything", () => {
    expect(
      reportScopeErrors({ role: "Admin", scope: "organization", projectId: null, isMember: false }),
    ).toEqual([]);
    expect(
      reportScopeErrors({ role: "Admin", scope: "project", projectId: 7, isMember: false }),
    ).toEqual([]);
  });

  it("lets SuperAdmin do anything", () => {
    expect(
      reportScopeErrors({
        role: "SuperAdmin",
        scope: "organization",
        projectId: null,
        isMember: false,
      }),
    ).toEqual([]);
  });

  it("refuses organization scope for a non-Admin", () => {
    // An organization-scope report is the union of every project in the
    // tenant, so it is the one shape the membership rule cannot narrow.
    const errors = reportScopeErrors({
      role: "Editor",
      scope: "organization",
      projectId: null,
      isMember: true,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Admin/);
  });

  it("refuses project scope with no projectId", () => {
    expect(
      reportScopeErrors({ role: "Editor", scope: "project", projectId: null, isMember: false }),
    ).toEqual(["project scope requires projectId"]);
  });

  it("refuses a project the caller does not belong to", () => {
    const errors = reportScopeErrors({
      role: "Auditor",
      scope: "project",
      projectId: 7,
      isMember: false,
    });
    expect(errors).toEqual(["you are not a member of this project"]);
  });

  it("allows a project the caller belongs to", () => {
    expect(
      reportScopeErrors({ role: "Editor", scope: "project", projectId: 7, isMember: true }),
    ).toEqual([]);
  });

  it("treats an absent scope as organization scope", () => {
    // reportTemplate.ctrl defaults an omitted scope to "organization", so the
    // rule must not fall through to "permitted" when scope is undefined.
    const errors = reportScopeErrors({
      role: "Editor",
      scope: undefined,
      projectId: null,
      isMember: false,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Admin/);
  });
});
