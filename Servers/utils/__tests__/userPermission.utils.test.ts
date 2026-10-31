import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// roleMap and rolePermissions.utils run for real; only the SQL reads and the
// user lookup are stubbed.
const ROLES = [
  { id: 1, name: "Admin", organization_id: null },
  { id: 3, name: "Editor", organization_id: null },
  // A custom role reusing the built-in name in org 7 (role.ctrl refuses to
  // create one, but a row could exist). It has no grants.
  { id: 20, name: "Admin", organization_id: 7 },
  { id: 21, name: "Ledger reader", organization_id: 7 },
];
const ROLE_PERMISSIONS: Record<number, Array<{ permission_key: string; allowed: boolean }>> = {
  20: [],
  21: [{ permission_key: "auditLedger.super", allowed: true }],
};

jest.mock("../role.utils", () => ({
  getAllRolesQuery: jest.fn(async () => ROLES),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(async (_sql: string, options?: { replacements?: { roleId?: number } }) => {
      return ROLE_PERMISSIONS[options?.replacements?.roleId ?? -1] ?? [];
    }),
  },
}));
jest.mock("../user.utils", () => ({ getUserByIdQuery: jest.fn() }));

import { getUserByIdQuery } from "../user.utils";
import { invalidateRolePermissionsCache } from "../rolePermissions.utils";
import { userHasPermission } from "../userPermission.utils";

const mockGetUser = getUserByIdQuery as unknown as jest.Mock<
  (id: number, transaction: unknown, organizationId?: number) => Promise<unknown>
>;

// Emulates the SQL organization filter: a user of another org is not found.
const usersById: Record<number, { id: number; organization_id: number; role_id: number }> = {
  5: { id: 5, organization_id: 7, role_id: 1 },
  6: { id: 6, organization_id: 7, role_id: 20 },
  8: { id: 8, organization_id: 7, role_id: 21 },
  9: { id: 9, organization_id: 7, role_id: 3 },
  10: { id: 10, organization_id: 99, role_id: 1 },
};

describe("userHasPermission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateRolePermissionsCache();
    mockGetUser.mockImplementation(async (id, _t, organizationId) => {
      const user = usersById[id];
      return user && user.organization_id === organizationId ? user : undefined;
    });
  });

  it("checks a built-in role_id against the built-in matrix even when the org has a custom role with the same name", async () => {
    // auditLedger.super is in the SUPER tier (Admin, SuperAdmin), so the
    // built-in Admin holds it; the org's custom "Admin" (no grants) does not.
    await expect(userHasPermission(7, 5, "auditLedger.super")).resolves.toBe(true);
    await expect(userHasPermission(7, 6, "auditLedger.super")).resolves.toBe(false);
  });

  it("uses the org matrix for a custom role", async () => {
    await expect(userHasPermission(7, 8, "auditLedger.super")).resolves.toBe(true);
  });

  it("denies a built-in role without the key", async () => {
    await expect(userHasPermission(7, 9, "auditLedger.super")).resolves.toBe(false);
  });

  it("filters the user lookup by organization", async () => {
    await expect(userHasPermission(7, 10, "auditLedger.super")).resolves.toBe(false);
    expect(mockGetUser).toHaveBeenCalledWith(10, null, 7);
  });

  it("denies without a user id and does not look one up", async () => {
    await expect(userHasPermission(7, undefined, "auditLedger.super")).resolves.toBe(false);
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});
