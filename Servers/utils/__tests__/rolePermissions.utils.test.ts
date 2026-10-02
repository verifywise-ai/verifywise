/**
 * @file rolePermissions.utils.test.ts
 * @description Regression tests for the permission-matrix resolution rules
 * (issue #4588): built-in parity, org scoping, fail-closed denies and caching.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { sequelize } from "../../database/db";
import { getRoleByName } from "../roleMap";
import {
  getEffectivePermissions,
  invalidateRolePermissionsCache,
  roleHasPermission,
} from "../rolePermissions.utils";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../roleMap", () => ({
  getRoleByName: jest.fn(),
}));

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockGetRoleByName = getRoleByName as jest.MockedFunction<typeof getRoleByName>;

const builtin = (name: string) => ({ id: 1, name, organizationId: null });
const custom = (id: number, name: string, organizationId: number) => ({
  id,
  name,
  organizationId,
});

beforeEach(() => {
  jest.clearAllMocks();
  // The cache module-level map persists across tests — flush it.
  invalidateRolePermissionsCache();
});

describe("roleHasPermission", () => {
  it("rejects unknown permission keys before touching the database", async () => {
    await expect(roleHasPermission(1, "Admin", "nope.admin" as any)).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("denies unknown roles (fail-closed)", async () => {
    mockGetRoleByName.mockResolvedValue(undefined);
    await expect(roleHasPermission(1, "Ghost", "risks.edit")).resolves.toBe(false);
  });

  it.each([
    ["Admin", "risks.edit", true],
    ["Admin", "ssoConfig.admin", true],
    ["Editor", "risks.edit", true],
    ["Editor", "ssoConfig.admin", false],
    ["Reviewer", "risks.edit", false],
    ["Reviewer", "aiDetection.read", true],
    ["Auditor", "risks.edit", false],
    ["Auditor", "aiDetection.read", true],
    ["SuperAdmin", "invitation.super", true],
    ["SuperAdmin", "risks.edit", false],
  ])("built-in parity: %s × %s → %s", async (role, key, expected) => {
    mockGetRoleByName.mockResolvedValue(builtin(role));
    await expect(roleHasPermission(1, role, key as any)).resolves.toBe(expected);
    // Built-ins resolve against the static matrix — no DB hit.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("denies a custom role evaluated in another organization", async () => {
    mockGetRoleByName.mockResolvedValue(custom(9, "AI Engineer", 2));
    await expect(roleHasPermission(1, "AI Engineer", "risks.edit")).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("denies a custom role without organization context", async () => {
    mockGetRoleByName.mockResolvedValue(custom(9, "AI Engineer", 2));
    await expect(roleHasPermission(null, "AI Engineer", "risks.edit")).resolves.toBe(false);
  });

  it("grants when the org's matrix has an allowed row", async () => {
    mockGetRoleByName.mockResolvedValue(custom(9, "AI Engineer", 1));
    mockQuery.mockResolvedValue([{ permission_key: "risks.edit", allowed: true }]);
    await expect(roleHasPermission(1, "AI Engineer", "risks.edit")).resolves.toBe(true);
  });

  it("denies when the org's matrix has a denied or missing row", async () => {
    mockGetRoleByName.mockResolvedValue(custom(9, "AI Engineer", 1));
    mockQuery.mockResolvedValue([{ permission_key: "risks.edit", allowed: false }]);
    await expect(roleHasPermission(1, "AI Engineer", "risks.edit")).resolves.toBe(false);
    await expect(roleHasPermission(1, "AI Engineer", "task.edit")).resolves.toBe(false);
  });

  it("caches a custom role's matrix until invalidated", async () => {
    mockGetRoleByName.mockResolvedValue(custom(9, "AI Engineer", 1));
    mockQuery.mockResolvedValue([{ permission_key: "risks.edit", allowed: true }]);

    await roleHasPermission(1, "AI Engineer", "risks.edit");
    await roleHasPermission(1, "AI Engineer", "risks.edit");
    expect(mockQuery).toHaveBeenCalledTimes(1);

    invalidateRolePermissionsCache(1, 9);
    await roleHasPermission(1, "AI Engineer", "risks.edit");
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("getEffectivePermissions", () => {
  it("returns the static matrix for built-in roles", async () => {
    mockGetRoleByName.mockResolvedValue(builtin("Editor"));
    const permissions = await getEffectivePermissions(1, "Editor");
    expect(permissions.has("risks.edit")).toBe(true);
    expect(permissions.has("ssoConfig.admin")).toBe(false);
  });

  it("returns the org matrix rows for custom roles", async () => {
    mockGetRoleByName.mockResolvedValue(custom(9, "AI Engineer", 1));
    mockQuery.mockResolvedValue([{ permission_key: "risks.edit", allowed: true }]);
    const permissions = await getEffectivePermissions(1, "AI Engineer");
    expect(permissions.has("risks.edit")).toBe(true);
    expect(permissions.has("task.edit")).toBe(false);
  });

  it("returns an empty set for unknown roles", async () => {
    mockGetRoleByName.mockResolvedValue(undefined);
    const permissions = await getEffectivePermissions(1, "Ghost");
    expect(permissions.size).toBe(0);
  });
});
