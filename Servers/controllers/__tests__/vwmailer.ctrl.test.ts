import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ALL_PERMISSION_KEYS, BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

jest.mock("../../utils/inviteEmail.utils", () => ({
  sendInviteEmail: jest.fn(),
}));
jest.mock("../../utils/invitation.utils", () => ({
  createInvitationQuery: jest.fn(),
  getPendingInvitationQuery: jest.fn(),
}));
jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(),
}));
jest.mock("../../utils/role.utils", () => ({
  getRoleByIdQuery: jest.fn(),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  getEffectivePermissions: jest.fn(),
  loadCustomRolePermissions: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import { invite } from "../vwmailer.ctrl";
import { sendInviteEmail } from "../../utils/inviteEmail.utils";
import { createInvitationQuery, getPendingInvitationQuery } from "../../utils/invitation.utils";
import { getRoleByName } from "../../utils/roleMap";
import { getRoleByIdQuery } from "../../utils/role.utils";
import {
  getEffectivePermissions,
  loadCustomRolePermissions,
} from "../../utils/rolePermissions.utils";

const mockSend = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;
const mockCreate = createInvitationQuery as jest.MockedFunction<typeof createInvitationQuery>;
const mockPending = getPendingInvitationQuery as jest.MockedFunction<
  typeof getPendingInvitationQuery
>;
const mockGetRole = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;
const mockCustomPermissions = loadCustomRolePermissions as jest.MockedFunction<
  typeof loadCustomRolePermissions
>;
const mockGetRoleByName = getRoleByName as jest.MockedFunction<typeof getRoleByName>;
const mockPermissions = getEffectivePermissions as jest.MockedFunction<
  typeof getEffectivePermissions
>;

const ROLES: Record<number, { id: number; name: string; organizationId: number | null }> = {
  1: { id: 1, name: "Admin", organizationId: null },
  3: { id: 3, name: "Editor", organizationId: null },
  4: { id: 4, name: "Auditor", organizationId: null },
  5: { id: 5, name: "SuperAdmin", organizationId: null },
  50: { id: 50, name: "Team lead", organizationId: 42 },
  51: { id: 51, name: "Viewer", organizationId: 42 },
  52: { id: 52, name: "Everything", organizationId: 42 },
  60: { id: 60, name: "Other org role", organizationId: 7 },
};

// Custom roles. "Team lead" may invite, with reader access otherwise;
// "Viewer" holds part of that; "Everything" holds every permission key.
const CUSTOM_PERMISSIONS: Record<string, Set<string>> = {
  "Team lead": new Set<string>([...BUILTIN_ROLE_PERMISSIONS.Auditor, "invitation.super"]),
  Viewer: new Set<string>([...BUILTIN_ROLE_PERMISSIONS.Auditor].slice(0, 3)),
  Everything: new Set<string>(ALL_PERMISSION_KEYS),
};

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    userId: 9,
    organizationId: 42,
    role: "Admin",
    t: (k: string) => k,
    lang: "en",
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const body = (overrides: Record<string, unknown> = {}): any => ({
  to: "new@example.com",
  name: "New",
  roleId: 3,
  organizationId: 42,
  ...overrides,
});

describe("vwmailer.ctrl invite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The invited role is read from the database (a roles row).
    mockGetRole.mockImplementation(async (id: number) =>
      ROLES[id]
        ? ({ id, name: ROLES[id].name, organization_id: ROLES[id].organizationId } as any)
        : null,
    );
    mockGetRoleByName.mockImplementation(async (_org, name: string) =>
      Object.values(ROLES).find((r) => r.name === name),
    );
    mockPermissions.mockImplementation(
      async (_org, roleName: string) =>
        CUSTOM_PERMISSIONS[roleName] ?? BUILTIN_ROLE_PERMISSIONS[roleName] ?? new Set(),
    );
    mockCustomPermissions.mockImplementation(
      async (_org, role) => CUSTOM_PERMISSIONS[role.name] ?? new Set(),
    );
    mockSend.mockResolvedValue({
      link: "http://x/user-reg?token=t",
      expiresAt: new Date(),
      info: {},
    } as any);
    mockCreate.mockResolvedValue({} as any);
    mockPending.mockResolvedValue(null);
  });

  // Re-inviting an email rewrites its pending invitation and voids that link,
  // so it follows the revoke rule for the pending invitation's role.
  it("refuses to replace a pending invitation for a role above the inviter's access", async () => {
    mockPending.mockResolvedValue({ id: 8, role_id: 1, expires_at_ms: 0 });
    const res = createRes();
    await invite(createReq({ role: "Team lead" }), res, body({ roleId: 51 }));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("replaces a pending invitation only while it is as checked", async () => {
    mockPending.mockResolvedValue({ id: 8, role_id: 4, expires_at_ms: 1234 });
    const res = createRes();
    await invite(createReq(), res, body({ roleId: 3 }));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCreate.mock.calls[0][7]).toEqual({
      replace: { id: 8, roleId: 4, expiresAtMs: 1234 },
    });
  });

  it("answers 409 without sending when a re-invite changed the invitation meanwhile", async () => {
    mockCreate.mockResolvedValue(null);
    const res = createRes();
    await invite(createReq(), res, body());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("lets a trusted caller replace any pending invitation, unguarded", async () => {
    const res = createRes();
    await invite(createReq({ role: undefined }), res, body(), { organizationId: 42 });

    expect(mockPending).not.toHaveBeenCalled();
    expect(mockCreate.mock.calls[0][7]).toEqual({ replace: undefined });
  });

  it("invites into the inviter's organization, ignoring the body's", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ organizationId: 7 }));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42 }));
    expect(mockCreate.mock.calls[0][0]).toBe(42);
  });

  it("accepts the role id as a numeric string, as the invite form sends it", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId: "3" }));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ roleId: 3 }));
  });

  it("refuses a caller without an organization", async () => {
    const res = createRes();
    await invite(createReq({ organizationId: undefined }), res, body());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each([["abc"], [0], [-1], [1.5], [undefined]])("refuses role id %p", async (roleId) => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId }));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses an unknown role", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId: 999 }));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses another organization's custom role", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId: 60 }));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses the SuperAdmin role, even for an Admin", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId: 5 }));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("lets an Admin invite an Admin", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId: 1 }));

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("lets an Admin invite into the organization's custom role", async () => {
    const res = createRes();
    await invite(createReq(), res, body({ roleId: 50 }));

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("refuses a role with access the inviter does not have", async () => {
    // A custom role allowed to invite must not hand out Admin or Editor.
    for (const roleId of [1, 3]) {
      const res = createRes();
      await invite(createReq({ role: "Team lead" }), res, body({ roleId }));
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("lets a custom inviting role grant a custom role within its access", async () => {
    const res = createRes();
    await invite(createReq({ role: "Team lead" }), res, body({ roleId: 51 }));

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("refuses a built-in role to a custom inviting role", async () => {
    // Built-in roles carry powers checked by role name, outside the
    // permission matrix, so only an Admin may grant them.
    const res = createRes();
    await invite(createReq({ role: "Team lead" }), res, body({ roleId: 4 }));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses Admin to a custom role that holds every permission", async () => {
    const res = createRes();
    await invite(createReq({ role: "Everything" }), res, body({ roleId: 1 }));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 500 without sending when the role lookup fails", async () => {
    mockGetRole.mockRejectedValueOnce(new Error("db down"));
    const res = createRes();
    await invite(createReq(), res, body());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  describe("trusted organization (super-admin invite)", () => {
    // A super admin has no organization of their own; the super-admin route
    // passes the target organization explicitly.
    const superAdminReq = () => createReq({ organizationId: undefined, role: "SuperAdmin" });

    it("invites into the given organization, without the inviter's ceiling", async () => {
      const res = createRes();
      await invite(superAdminReq(), res, body({ roleId: 1, organizationId: 7 }), {
        organizationId: 42,
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 42, roleId: 1 }),
      );
      expect(mockCreate.mock.calls[0][0]).toBe(42);
    });

    it("accepts the given organization's custom role", async () => {
      const res = createRes();
      await invite(superAdminReq(), res, body({ roleId: 50 }), { organizationId: 42 });

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("still refuses another organization's role and SuperAdmin", async () => {
      for (const roleId of [60, 5]) {
        const res = createRes();
        await invite(superAdminReq(), res, body({ roleId }), { organizationId: 42 });
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
