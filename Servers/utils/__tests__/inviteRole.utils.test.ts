import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../roleMap", () => ({
  getRoleByName: jest.fn(),
  getRoleNameById: jest.fn(),
}));
jest.mock("../role.utils", () => ({ getRoleByIdQuery: jest.fn() }));
jest.mock("../rolePermissions.utils", () => ({
  getEffectivePermissions: jest.fn(),
  loadCustomRolePermissions: jest.fn(),
  roleHasPermission: jest.fn(),
}));
jest.mock("../user.utils", () => ({ getUserByIdQuery: jest.fn() }));

import { getRoleByName, getRoleNameById } from "../roleMap";
import { getRoleByIdQuery } from "../role.utils";
import { roleHasPermission } from "../rolePermissions.utils";
import { getUserByIdQuery } from "../user.utils";
import { userInviteRefusal } from "../inviteRole.utils";

const mockUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockRoleName = getRoleNameById as jest.MockedFunction<typeof getRoleNameById>;
const mockHasPermission = roleHasPermission as jest.MockedFunction<typeof roleHasPermission>;
const mockRoleInfo = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;
const mockRoleByName = getRoleByName as jest.MockedFunction<typeof getRoleByName>;

const ORG = 7;

describe("userInviteRefusal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockResolvedValue({ id: 5, organization_id: ORG, role_id: 1 } as any);
    mockRoleName.mockResolvedValue("Admin");
    mockHasPermission.mockResolvedValue(true);
    mockRoleInfo.mockResolvedValue({ id: 3, name: "Editor", organization_id: null } as any);
    mockRoleByName.mockResolvedValue({ id: 1, name: "Admin", organizationId: null } as any);
  });

  it("allows an Admin of the organization to invite a built-in role", async () => {
    expect(await userInviteRefusal(ORG, 5, 3)).toBeNull();
    expect(mockHasPermission).toHaveBeenCalledWith(ORG, "Admin", "invitation.super");
  });

  it("refuses a missing user id without a lookup", async () => {
    expect(await userInviteRefusal(ORG, 0, 3)).toBe("not_allowed");
    expect(mockUser).not.toHaveBeenCalled();
  });

  it("refuses a user who no longer exists", async () => {
    mockUser.mockResolvedValue(undefined as any);
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("not_allowed");
  });

  it("refuses a user from another organization", async () => {
    mockUser.mockResolvedValue({ id: 5, organization_id: ORG + 1, role_id: 1 } as any);
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("not_allowed");
  });

  it("refuses a role without invitation.super", async () => {
    mockRoleName.mockResolvedValue("Reviewer");
    mockHasPermission.mockResolvedValue(false);
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("not_allowed");
  });

  it("applies the role rules to an allowed inviter", async () => {
    // A custom role with invitation.super may not grant a built-in role.
    mockRoleName.mockResolvedValue("Team lead");
    mockRoleByName.mockResolvedValue({ id: 9, name: "Team lead", organizationId: ORG } as any);
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("exceeds_access");

    mockRoleInfo.mockResolvedValue(null);
    expect(await userInviteRefusal(ORG, 5, 999)).toBe("unknown_role");
  });
});
