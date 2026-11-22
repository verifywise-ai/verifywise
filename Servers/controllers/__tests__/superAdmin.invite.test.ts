import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../vwmailer.ctrl", () => ({
  invite: jest.fn(),
}));
jest.mock("../../utils/organization.utils", () => ({
  createOrganizationQuery: jest.fn(),
}));
jest.mock("../../utils/invitation.utils", () => ({
  createInvitationQuery: jest.fn(),
  getInvitationsByOrganizationQuery: jest.fn(),
}));
jest.mock("../../domain.layer/models/organization/organization.model", () => ({
  OrganizationModel: { createNewOrganization: jest.fn(async () => ({})) },
}));
jest.mock("../../utils/inviteRole.utils", () => ({
  inviteRoleRefusal: jest.fn(),
}));
jest.mock("../user.ctrl", () => ({
  createNewUserWrapper: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
  getUserByEmailQuery: jest.fn(),
  removeUserFromOrganizationQuery: jest.fn(),
  isLastAdminQuery: jest.fn(async () => false),
}));
jest.mock("../../utils/organizationMember.utils", () => ({
  getUserOrganizationsQuery: jest.fn(),
  updateOrganizationMemberRoleQuery: jest.fn(),
  addOrganizationMemberQuery: jest.fn(),
}));

import {
  createOrgWithUser,
  createUserInOrg,
  inviteUserToOrg,
  removeOrgUser,
  revokeSuperAdmin,
  updateUser,
} from "../superAdmin.ctrl";
import { createNewUserWrapper } from "../user.ctrl";
import { invite } from "../vwmailer.ctrl";
import { sequelize } from "../../database/db";
import { createOrganizationQuery } from "../../utils/organization.utils";
import { createInvitationQuery } from "../../utils/invitation.utils";
import { inviteRoleRefusal } from "../../utils/inviteRole.utils";
import {
  getUserByEmailQuery,
  getUserByIdQuery,
  removeUserFromOrganizationQuery,
} from "../../utils/user.utils";
import {
  addOrganizationMemberQuery,
  getUserOrganizationsQuery,
  updateOrganizationMemberRoleQuery,
} from "../../utils/organizationMember.utils";

const mockInvite = invite as jest.MockedFunction<typeof invite>;
const mockQuery = sequelize.query as unknown as jest.Mock;

const createRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("superAdmin.ctrl inviteUserToOrg", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The organization exists.
    mockQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes("FROM organizations") ? [{ id: 12 }] : [],
    );
  });

  it("invites into the organization from the route, passed as trusted", async () => {
    // invite() ignores an organization in the body, so the route's
    // organization must arrive as the trusted argument.
    const req: any = {
      params: { id: "12" },
      body: { email: "new@x.com", name: "New", surname: "User", roleId: 3 },
      t: (k: string) => k,
    };
    const res = createRes();

    await inviteUserToOrg(req, res);

    expect(mockInvite).toHaveBeenCalledWith(
      req,
      res,
      { to: "new@x.com", name: "New", surname: "User", roleId: 3 },
      { organizationId: 12 },
    );
  });

  it("refuses an organization id that is not a positive integer", async () => {
    const req: any = {
      params: { id: "abc" },
      body: { email: "new@x.com", name: "New", roleId: 3 },
      t: (k: string) => k,
    };
    const res = createRes();

    await inviteUserToOrg(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it("answers 404 for an organization that does not exist", async () => {
    mockQuery.mockResolvedValue([] as never);
    const req: any = {
      params: { id: "999" },
      body: { email: "new@x.com", name: "New", roleId: 3 },
      t: (k: string) => k,
    };
    const res = createRes();

    await inviteUserToOrg(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockInvite).not.toHaveBeenCalled();
  });
});

describe("superAdmin.ctrl inviteUserToOrg lookup errors", () => {
  it("answers 500 when the organization lookup fails", async () => {
    mockQuery.mockRejectedValue(new Error("db down") as never);
    const req: any = {
      params: { id: "12" },
      body: { email: "new@x.com", name: "New", roleId: 3 },
      t: (k: string) => k,
    };
    const res = createRes();

    await inviteUserToOrg(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockInvite).not.toHaveBeenCalled();
  });
});

describe("superAdmin.ctrl createOrgWithUser (invite mode)", () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(transaction as never);
    (createOrganizationQuery as unknown as jest.Mock).mockResolvedValue({ id: 30 } as never);
  });

  it("refuses a role the invite rules refuse, without saving the organization", async () => {
    (inviteRoleRefusal as unknown as jest.Mock).mockResolvedValue("unknown_role" as never);
    const req: any = {
      body: {
        orgName: "Acme",
        mode: "invite",
        user: { email: "new@x.com", name: "New", roleId: 60 },
      },
      userId: 1,
      t: (k: string) => k,
    };
    const res = createRes();

    await createOrgWithUser(req, res);

    expect(inviteRoleRefusal).toHaveBeenCalledWith(30, null, 60);
    expect(createInvitationQuery).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// Creating or re-roling a user directly takes the same role check as an
// invite: a built-in other than SuperAdmin, or the organization's own role.
describe("superAdmin.ctrl direct role assignment", () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  const t = (k: string) => k;

  beforeEach(() => {
    jest.clearAllMocks();
    (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(transaction as never);
    (createOrganizationQuery as unknown as jest.Mock).mockResolvedValue({ id: 30 } as never);
    (inviteRoleRefusal as unknown as jest.Mock).mockResolvedValue("unknown_role" as never);
  });

  it("refuses a role the rules refuse when creating an organization in direct mode", async () => {
    const req: any = {
      body: {
        orgName: "Acme",
        mode: "direct",
        user: { email: "new@x.com", name: "New", surname: "U", password: "pw", roleId: 60 },
      },
      userId: 1,
      t,
    };
    const res = createRes();

    await createOrgWithUser(req, res);

    expect(inviteRoleRefusal).toHaveBeenCalledWith(30, null, 60);
    expect(createNewUserWrapper).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each(["abc", 2.5, -1])(
    "answers 400 for role id %p before writing anything",
    async (roleId) => {
      const req: any = {
        body: {
          orgName: "Acme",
          mode: "invite",
          user: { email: "new@x.com", name: "New", roleId },
        },
        userId: 1,
        t,
      };
      const res = createRes();

      await createOrgWithUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(sequelize.transaction).not.toHaveBeenCalled();
    },
  );

  it("refuses a role the rules refuse when creating a user in an organization", async () => {
    const req: any = {
      params: { id: "12" },
      body: { email: "new@x.com", name: "New", surname: "U", password: "pw", roleId: "60" },
      t,
    };
    const res = createRes();

    await createUserInOrg(req, res);

    expect(inviteRoleRefusal).toHaveBeenCalledWith(12, null, 60);
    expect(createNewUserWrapper).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  describe("creating a user whose email already has an account", () => {
    const createReqFor = () => ({
      params: { id: "12" },
      body: { email: "priya@x.io", name: "New", surname: "U", password: "pw", roleId: "3" },
      t,
    });

    beforeEach(() => {
      (inviteRoleRefusal as unknown as jest.Mock).mockResolvedValue(null as never);
      (getUserByEmailQuery as unknown as jest.Mock).mockResolvedValue({
        id: 7,
        email: "priya@x.io",
        password_hash: "hash",
      } as never);
    });

    it("adds the account to the organization, leaving its password alone", async () => {
      (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([
        { organization_id: 4, organization_name: "Globex", role_id: 1, role_name: "Admin" },
      ] as never);
      const res = createRes();

      await createUserInOrg(createReqFor() as any, res);

      expect(addOrganizationMemberQuery).toHaveBeenCalledWith(12, 7, 3, transaction);
      expect(createNewUserWrapper).not.toHaveBeenCalled();
      expect(transaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      const data = (res.json as jest.Mock).mock.calls[0][0] as any;
      expect(data.data).toEqual(
        expect.objectContaining({ id: 7, role_id: 3, existing_account: true }),
      );
      expect(data.data.password_hash).toBeUndefined();
    });

    it("refuses a pure super admin", async () => {
      (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([] as never);
      const res = createRes();

      await createUserInOrg(createReqFor() as any, res);

      expect(addOrganizationMemberQuery).not.toHaveBeenCalled();
      expect(transaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("refuses an account that is already a member", async () => {
      (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([
        { organization_id: 12, organization_name: "Acme", role_id: 4, role_name: "Auditor" },
      ] as never);
      const res = createRes();

      await createUserInOrg(createReqFor() as any, res);

      expect(addOrganizationMemberQuery).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe("updating a user", () => {
    beforeEach(() => {
      (getUserByIdQuery as unknown as jest.Mock).mockResolvedValue({ id: 5 } as never);
      (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([
        { organization_id: 12, organization_name: "Acme", role_id: 3, role_name: "Editor" },
      ] as never);
      mockQuery.mockResolvedValue([{ id: 5 }] as never);
    });

    it("saves other fields without checking an unchanged role", async () => {
      const req: any = {
        params: { id: "5" },
        body: { name: "Renamed", roleId: 3, organizationId: 12 },
        t,
      };
      const res = createRes();

      await updateUser(req, res);

      expect(inviteRoleRefusal).not.toHaveBeenCalled();
      expect(updateOrganizationMemberRoleQuery).not.toHaveBeenCalled();
      expect(String(mockQuery.mock.calls[0][0])).toContain("UPDATE users SET name = :name");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("changes the role of the membership in the named organization", async () => {
      (inviteRoleRefusal as unknown as jest.Mock).mockResolvedValue(null as never);
      const req: any = { params: { id: "5" }, body: { roleId: 4, organizationId: 12 }, t };
      const res = createRes();

      await updateUser(req, res);

      expect(inviteRoleRefusal).toHaveBeenCalledWith(12, null, 4);
      expect(updateOrganizationMemberRoleQuery).toHaveBeenCalledWith(12, 5, 4, transaction);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("refuses a role the rules refuse when updating a user, without updating", async () => {
      const req: any = { params: { id: "5" }, body: { roleId: 60, organizationId: 12 }, t };
      const res = createRes();

      await updateUser(req, res);

      expect(inviteRoleRefusal).toHaveBeenCalledWith(12, null, 60);
      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 404 for a role in an organization the user is not a member of", async () => {
      const req: any = { params: { id: "5" }, body: { roleId: 3, organizationId: 99 }, t };
      const res = createRes();

      await updateUser(req, res);

      expect(inviteRoleRefusal).not.toHaveBeenCalled();
      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("refuses a pure super admin, who has no membership", async () => {
      (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([] as never);
      const req: any = { params: { id: "5" }, body: { name: "Renamed" }, t };
      const res = createRes();

      await updateUser(req, res);

      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});

describe("superAdmin.ctrl accounts that already exist", () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  const t = (k: string) => k;
  const existing = { id: 7, email: "priya@x.io", password_hash: "hash" };
  const memberElsewhere = [
    { organization_id: 4, organization_name: "Globex", role_id: 1, role_name: "Admin" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(transaction as never);
    (createOrganizationQuery as unknown as jest.Mock).mockResolvedValue({ id: 30 } as never);
    (inviteRoleRefusal as unknown as jest.Mock).mockResolvedValue(null as never);
    (getUserByEmailQuery as unknown as jest.Mock).mockResolvedValue(null as never);
  });

  const createOrgReq = (mode: "invite" | "direct", password?: string): any => ({
    body: {
      orgName: "Acme",
      mode,
      user: { email: "priya@x.io", name: "Priya", surname: "S", roleId: 1, password },
    },
    userId: 1,
    t,
  });

  it("creating an organization adds an existing account as its first user", async () => {
    (getUserByEmailQuery as unknown as jest.Mock).mockResolvedValue(existing as never);
    (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue(memberElsewhere as never);
    const res = createRes();

    await createOrgWithUser(createOrgReq("direct"), res);

    expect(addOrganizationMemberQuery).toHaveBeenCalledWith(30, 7, 1, transaction);
    expect(createNewUserWrapper).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ data: { organizationId: 30, existingAccount: true } }),
    );
  });

  it.each(["direct", "invite"] as const)(
    "creating an organization refuses a pure super admin (%s)",
    async (mode) => {
      (getUserByEmailQuery as unknown as jest.Mock).mockResolvedValue(existing as never);
      (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([] as never);
      const res = createRes();

      await createOrgWithUser(createOrgReq(mode, "Password#1"), res);

      expect(addOrganizationMemberQuery).not.toHaveBeenCalled();
      expect(createInvitationQuery).not.toHaveBeenCalled();
      expect(transaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    },
  );

  it("creating an organization still needs a password for a new account", async () => {
    const res = createRes();

    await createOrgWithUser(createOrgReq("direct"), res);

    expect(createNewUserWrapper).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  const createUserReq = (password?: string): any => ({
    params: { id: "12" },
    body: { email: "priya@x.io", name: "Priya", surname: "S", roleId: "3", password },
    t,
  });

  it("creating a user needs no password for an existing account", async () => {
    (getUserByEmailQuery as unknown as jest.Mock).mockResolvedValue(existing as never);
    (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue(memberElsewhere as never);
    const res = createRes();

    await createUserInOrg(createUserReq(), res);

    expect(addOrganizationMemberQuery).toHaveBeenCalledWith(12, 7, 3, transaction);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("creating a user needs a password for a new account", async () => {
    const res = createRes();

    await createUserInOrg(createUserReq(), res);

    expect(createNewUserWrapper).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("superAdmin.ctrl removeOrgUser", () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  const req = (id: string, userId: string): any => ({
    params: { id, userId },
    t: (k: string) => k,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(transaction as never);
  });

  it("removes the user from that organization only", async () => {
    (removeUserFromOrganizationQuery as unknown as jest.Mock).mockResolvedValue({
      removed: true,
      accountDeleted: false,
    } as never);
    const res = createRes();

    await removeOrgUser(req("12", "7"), res);

    expect(removeUserFromOrganizationQuery).toHaveBeenCalledWith(7, 12, transaction);
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ data: { removed: true, userId: 7, accountDeleted: false } }),
    );
  });

  it("answers 404 for a user who is not a member", async () => {
    (removeUserFromOrganizationQuery as unknown as jest.Mock).mockResolvedValue({
      removed: false,
      accountDeleted: false,
    } as never);
    const res = createRes();

    await removeOrgUser(req("12", "7"), res);

    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each([
    ["abc", "7"],
    ["12", "abc"],
  ])("answers 400 for ids %p / %p", async (id, userId) => {
    const res = createRes();

    await removeOrgUser(req(id, userId), res);

    expect(removeUserFromOrganizationQuery).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("superAdmin.ctrl revokeSuperAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The target is a super admin, and there are two.
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("COUNT(*)")) return [{ count: "2" }];
      if (String(sql).includes("FROM super_admins WHERE user_id")) return [{ exists: 1 }];
      return [];
    });
  });

  it("refuses a super admin with no organization", async () => {
    (getUserOrganizationsQuery as unknown as jest.Mock).mockResolvedValue([] as never);
    const req: any = { params: { user_id: "7" }, userId: 1, t: (k: string) => k };
    const res = createRes();

    await revokeSuperAdmin(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM super_admins"),
      expect.anything(),
    );
  });
});
