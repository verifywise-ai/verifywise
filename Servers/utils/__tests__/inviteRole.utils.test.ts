import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../roleMap", () => ({
  getRoleByName: jest.fn(),
  getRoleById: jest.fn(),
}));
jest.mock("../role.utils", () => ({ getRoleByIdQuery: jest.fn() }));
jest.mock("../rolePermissions.utils", () => ({
  getEffectivePermissions: jest.fn(),
  loadCustomRolePermissions: jest.fn(),
  roleInfoHasPermission: jest.fn(),
}));
jest.mock("../user.utils", () => ({ getUserByIdQuery: jest.fn() }));

import { getRoleByName, getRoleById } from "../roleMap";
import { getRoleByIdQuery } from "../role.utils";
import { roleInfoHasPermission } from "../rolePermissions.utils";
import { getUserByIdQuery } from "../user.utils";
import { userInviteRefusal } from "../inviteRole.utils";

const mockUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockRoleById = getRoleById as jest.MockedFunction<typeof getRoleById>;
const mockHasPermission = roleInfoHasPermission as jest.MockedFunction<
  typeof roleInfoHasPermission
>;
const mockRoleInfo = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;
const mockRoleByName = getRoleByName as jest.MockedFunction<typeof getRoleByName>;

const ORG = 7;
const ADMIN = { id: 1, name: "Admin", organizationId: null };

// Emulates the SQL organization filter in getUserByIdQuery(id, null, orgId).
const userRow = (organization_id: number) =>
  (async (_id: number, _t: unknown, orgId?: number) =>
    organization_id === orgId ? ({ id: 5, organization_id, role_id: 1 } as any) : undefined) as any;

describe("userInviteRefusal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockImplementation(userRow(ORG));
    mockRoleById.mockResolvedValue(ADMIN);
    mockHasPermission.mockResolvedValue(true);
    mockRoleInfo.mockResolvedValue({ id: 3, name: "Editor", organization_id: null } as any);
    mockRoleByName.mockResolvedValue({ id: 1, name: "Admin", organizationId: null } as any);
  });

  it("allows an Admin of the organization to invite a built-in role", async () => {
    expect(await userInviteRefusal(ORG, 5, 3)).toBeNull();
    expect(mockHasPermission).toHaveBeenCalledWith(ORG, ADMIN, "invitation.super");
    expect(mockUser).toHaveBeenCalledWith(5, null, ORG);
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
    mockUser.mockImplementation(userRow(ORG + 1));
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("not_allowed");
  });

  it("refuses a role without invitation.super", async () => {
    mockRoleById.mockResolvedValue({ id: 2, name: "Reviewer", organizationId: null });
    mockHasPermission.mockResolvedValue(false);
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("not_allowed");
  });

  it("applies the role rules to an allowed inviter", async () => {
    // A custom role with invitation.super may not grant a built-in role.
    mockRoleById.mockResolvedValue({ id: 9, name: "Team lead", organizationId: ORG });
    mockRoleByName.mockResolvedValue({ id: 9, name: "Team lead", organizationId: ORG } as any);
    expect(await userInviteRefusal(ORG, 5, 3)).toBe("exceeds_access");

    mockRoleInfo.mockResolvedValue(null);
    expect(await userInviteRefusal(ORG, 5, 999)).toBe("unknown_role");
  });
});
