import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockRoleHasPermission = jest.fn(async (..._args: any[]): Promise<boolean> => true);
jest.mock("../rolePermissions.utils", () => ({
  roleHasPermission: (...args: any[]) => mockRoleHasPermission(...args),
}));

import { requestCallerIsAdmin, roleIsOrganizationAdmin } from "../organizationAdmin.utils";
import { callerCanDecideAnyRisk } from "../riskApproval.utils";

beforeEach(() => {
  mockRoleHasPermission.mockClear();
});

describe("organization Admin check", () => {
  it("asks for organization.admin in the request's organization", async () => {
    expect(await requestCallerIsAdmin({ organizationId: 4, role: "Admin" } as any)).toBe(true);
    expect(mockRoleHasPermission).toHaveBeenCalledWith(4, "Admin", "organization.admin");
  });

  it("is false without a role, without asking", async () => {
    expect(await roleIsOrganizationAdmin(4, "")).toBe(false);
    expect(await requestCallerIsAdmin({ organizationId: 4 } as any)).toBe(false);
    expect(mockRoleHasPermission).not.toHaveBeenCalled();
  });

  it("is the rule the risk approval uses", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(false);
    expect(await callerCanDecideAnyRisk(4, "Editor")).toBe(false);
    expect(mockRoleHasPermission).toHaveBeenCalledWith(4, "Editor", "organization.admin");
  });
});
