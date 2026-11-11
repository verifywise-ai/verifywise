import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

/**
 * authorize(key) through the real resolution path (issue #5314 review): the
 * real middleware, the real rolePermissions.utils, and a role map that
 * resolves names the way production does. Built-in roles are global rows
 * (organization_id NULL); there is no "SuperAdmin" row since migration
 * 20260813133028, so getRoleByName(null, "SuperAdmin") is undefined; custom
 * roles are org rows whose permissions come from role_permissions.
 */

const CUSTOM = { id: 77, name: "Risk lead", organizationId: 42 };
let mockCustomRows: Array<{ permission_key: string; allowed: boolean }> = [];

jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (orgId: number | null, name: string) => {
    if (name === "Risk lead" && orgId === 42) return { id: 77, name, organizationId: 42 };
    const ids: Record<string, number> = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 };
    return ids[name] ? { id: ids[name], name, organizationId: null } : undefined;
  }),
}));
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(async () => mockCustomRows) },
}));

import authorize from "../accessControl.middleware";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";
import type { PermissionKey } from "../../config/rolePermissions.config";

type Shape = { label: string; role: string; organizationId?: number; isSuperAdmin?: boolean };

const SHAPES: Shape[] = [
  { label: "Admin", role: "Admin", organizationId: 42 },
  { label: "Editor", role: "Editor", organizationId: 42 },
  { label: "Reviewer", role: "Reviewer", organizationId: 42 },
  { label: "Auditor", role: "Auditor", organizationId: 42 },
  { label: "pure super admin", role: "SuperAdmin", isSuperAdmin: true },
  // An elected super admin keeps their org role; the old literal lists
  // matched only the role name, so neither list nor key admits an Editor.
  { label: "elected super admin (Editor)", role: "Editor", organizationId: 42, isSuperAdmin: true },
];

async function allowed(key: PermissionKey, shape: Shape): Promise<boolean> {
  const req = {
    role: shape.role,
    organizationId: shape.organizationId,
    isSuperAdmin: shape.isSuperAdmin ?? false,
    t: (k: string) => k,
  } as unknown as Request;
  const res = {} as Partial<Response>;
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  const next = jest.fn();
  await authorize(key)(req, res as Response, next);
  return next.mock.calls.length === 1 && next.mock.calls[0].length === 0;
}

describe("authorize(key) keeps every route's old role-name list (real resolution)", () => {
  beforeEach(() => {
    mockCustomRows = [];
    invalidateRolePermissionsCache();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  // Every route converted from authorize([...]) in #5314, with the list it had.
  const CONVERTED: Array<[string, PermissionKey, string[]]> = [
    ["riskLinks org-wide reports and backfills (8)", "riskLinks.admin", ["Admin", "SuperAdmin"]],
    ["riskLinks create and acknowledge (2)", "riskLinks.edit", ["Admin", "Editor"]],
    ["riskLinks status review (1)", "riskLinks.review", ["Admin", "Editor", "Reviewer"]],
    ["evidence freshness sweep", "evidence.admin", ["Admin"]],
    ["use case org settings PUT", "organization.admin", ["Admin"]],
  ];

  for (const [label, key, oldList] of CONVERTED) {
    it.each(SHAPES)(`${label}: $label gets the same answer as before`, async (shape) => {
      expect(await allowed(key, shape)).toBe(oldList.includes(shape.role));
    });
  }

  // The #4588 super-tier keys had the same gap: a pure super admin was
  // refused because the role map cannot resolve "SuperAdmin".
  it.each(["auditLedger.super", "invitation.super", "user.deleteSuper"] as PermissionKey[])(
    "admits a pure super admin on %s, as the old Admin/SuperAdmin list did",
    async (key) => {
      expect(await allowed(key, SHAPES[4])).toBe(true);
    },
  );

  it("does not treat a token that only claims SuperAdmin as a super admin", async () => {
    expect(await allowed("riskLinks.admin", { label: "forged", role: "SuperAdmin" })).toBe(false);
  });

  it("admits a custom role only for the keys it was granted", async () => {
    mockCustomRows = [{ permission_key: "riskLinks.admin", allowed: true }];
    invalidateRolePermissionsCache(42, CUSTOM.id);
    const shape = { label: "custom", role: CUSTOM.name, organizationId: 42 };
    expect(await allowed("riskLinks.admin", shape)).toBe(true);
    expect(await allowed("riskLinks.edit", shape)).toBe(false);
  });
});
