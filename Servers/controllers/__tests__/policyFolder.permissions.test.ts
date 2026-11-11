import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// PATCH /policies/:id/folders used ALLOWED_ROLES = ["Admin", "SuperAdmin",
// "Editor"]; it now follows policy.edit (#5314), with a pure super admin kept.
// The permission check runs for real against a production-shaped role map.

let mockCustomRows: Array<{ permission_key: string; allowed: boolean }> = [];
const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };

jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (orgId: number | null, name: string) => {
    if (name === "Policy lead" && orgId === 5) return { id: 60, name, organizationId: 5 };
    const ids: Record<string, number> = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 };
    return ids[name] ? { id: ids[name], name, organizationId: null } : undefined;
  }),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(async () => mockCustomRows),
    transaction: jest.fn(async () => mockTransaction),
  },
}));
jest.mock("../../utils/policyFolder.utils", () => ({
  getPolicyFoldersQuery: jest.fn(async () => []),
  getPolicyIdsInFolderQuery: jest.fn(async () => []),
  bulkUpdatePolicyFoldersQuery: jest.fn(async () => undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { updatePolicyFolders } from "../policyFolder.ctrl";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";

async function statusFor(req: Partial<Request>): Promise<number> {
  const res: Partial<Response> = {};
  let status = 200;
  res.status = jest.fn((code: number) => {
    status = code;
    return res;
  }) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  await updatePolicyFolders(
    {
      params: { id: "3" },
      body: { folder_ids: [1] },
      t: (k: string) => k,
      ...req,
    } as unknown as Request,
    res as Response,
  );
  return status;
}

describe("PATCH /policies/:id/folders permission", () => {
  beforeEach(() => {
    mockCustomRows = [];
    invalidateRolePermissionsCache();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(["Admin", "Editor"])("lets a built-in %s through", async (role) => {
    expect(await statusFor({ role, organizationId: 5 })).not.toBe(403);
  });

  it.each(["Reviewer", "Auditor"])("refuses a built-in %s", async (role) => {
    expect(await statusFor({ role, organizationId: 5 })).toBe(403);
  });

  it("lets a pure super admin through, as the old list did", async () => {
    expect(await statusFor({ role: "SuperAdmin", isSuperAdmin: true })).not.toBe(403);
  });

  it("follows policy.edit for a custom role", async () => {
    mockCustomRows = [{ permission_key: "policy.edit", allowed: true }];
    expect(await statusFor({ role: "Policy lead", organizationId: 5 })).not.toBe(403);
    invalidateRolePermissionsCache();
    mockCustomRows = [{ permission_key: "vendor.edit", allowed: true }];
    expect(await statusFor({ role: "Policy lead", organizationId: 5 })).toBe(403);
  });
});
