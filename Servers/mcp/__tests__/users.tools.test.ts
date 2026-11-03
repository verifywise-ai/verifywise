import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../services/superAdmin.service", () => ({
  createUserInOrganization: jest.fn(),
  removeUserById: jest.fn(),
  removeUserFromOrganization: jest.fn(),
  updateUserDetails: jest.fn(),
}));
jest.mock("../../utils/superAdmin.utils", () => ({
  listAllUsersQuery: jest.fn(),
  listOrganizationUsersQuery: jest.fn(),
  organizationExists: jest.fn(),
}));
jest.mock("../../services/invitation.service", () => ({
  InviteRefusalError: class InviteRefusalError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
  inviteUserToOrganization: jest.fn(),
}));
jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(),
}));
jest.mock("../../utils/invitation.utils", () => ({
  getInvitationsByOrganizationQuery: jest.fn(),
}));

import {
  removeUserById,
  removeUserFromOrganization,
  updateUserDetails,
} from "../../services/superAdmin.service";
import { listOrganizationUsersQuery, organizationExists } from "../../utils/superAdmin.utils";
import { InviteRefusalError, inviteUserToOrganization } from "../../services/invitation.service";
import { getRoleByName } from "../../utils/roleMap";
import { getInvitationsByOrganizationQuery } from "../../utils/invitation.utils";
import { scopeToOrganization } from "../scope";
import { organizationUserTools, userTools } from "../tools/users";

const SUPER_ADMIN = { userId: 7, organizationId: null, role: "SuperAdmin", isSuperAdmin: true };
const ADMIN = { userId: 8, organizationId: 3, role: "Admin", isSuperAdmin: false };

/** An Admin's tool as the server registers it: pinned to organization 3. */
const adminTool = (name: string) => {
  const found = organizationUserTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return scopeToOrganization(found, 3);
};

const superAdminTool = (name: string) => {
  const found = userTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

const payload = (res: any) => JSON.parse(res.content[0].text);

describe("mcp/tools/users — organization Admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRoleByName as jest.Mock<any>).mockResolvedValue({ id: 3, name: "Editor" });
  });

  it("offers no tool that sets a password or deletes an account", () => {
    expect(organizationUserTools.map((t) => t.name).sort()).toEqual([
      "invite_user",
      "list_users",
      "remove_user",
      "update_user_role",
    ]);
  });

  it("list_users lists only the Admin's organization", async () => {
    (listOrganizationUsersQuery as jest.Mock<any>).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await adminTool("list_users").handler({}, ADMIN);
    expect(listOrganizationUsersQuery).toHaveBeenCalledWith(3);
    expect(payload(res)).toEqual({ organizationId: 3, count: 2, users: [{ id: 1 }, { id: 2 }] });
  });

  /** The Team settings pass the inviter's role, which applies the role ceiling. */
  it("invite_user invites into the Admin's organization under the Admin's role", async () => {
    (inviteUserToOrganization as jest.Mock<any>).mockResolvedValue({ emailSent: true });
    await adminTool("invite_user").handler(
      { email: "a@b.co", firstName: "Ann", role: "Editor" },
      ADMIN,
    );
    expect(getRoleByName).toHaveBeenCalledWith(3, "Editor");
    expect(inviteUserToOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 3, roleId: 3, invitedBy: 8, inviterRole: "Admin" }),
    );
  });

  it("invite_user reports a refusal as a sentence", async () => {
    (inviteUserToOrganization as jest.Mock<any>).mockRejectedValue(
      new (InviteRefusalError as any)("already_member"),
    );
    await expect(
      adminTool("invite_user").handler(
        { email: "a@b.co", firstName: "Ann", role: "Editor" },
        ADMIN,
      ),
    ).rejects.toThrow("That user is already a member of this organization.");
  });

  it("update_user_role changes the role in the Admin's organization and nothing else", async () => {
    (updateUserDetails as jest.Mock<any>).mockResolvedValue({ id: 12 });
    await adminTool("update_user_role").handler({ userId: 12, role: "Editor" }, ADMIN);
    expect(updateUserDetails).toHaveBeenCalledWith(12, { roleId: 3, organizationId: 3 });
  });

  /** The service lists every membership; other organizations are not the Admin's to see. */
  it("update_user_role answers with the Admin's organization only", async () => {
    (updateUserDetails as jest.Mock<any>).mockResolvedValue({
      id: 12,
      name: "Ann",
      surname: "Lee",
      email: "a@b.co",
      organizations: [{ organization_id: 9, organization_name: "Other Co", role_name: "Admin" }],
    });
    const res = await adminTool("update_user_role").handler({ userId: 12, role: "Editor" }, ADMIN);
    expect(payload(res)).toEqual({
      user: {
        id: 12,
        name: "Ann",
        surname: "Lee",
        email: "a@b.co",
        organizationId: 3,
        role: "Editor",
      },
    });
  });

  it("update_user_role refuses an unknown role before changing anything", async () => {
    (getRoleByName as jest.Mock<any>).mockResolvedValue(null);
    await expect(
      adminTool("update_user_role").handler({ userId: 12, role: "Owner" }, ADMIN),
    ).rejects.toThrow('Unknown role "Owner" on this deployment.');
    expect(updateUserDetails).not.toHaveBeenCalled();
  });

  it("remove_user removes the membership, not the account", async () => {
    (removeUserFromOrganization as jest.Mock<any>).mockResolvedValue({
      removed: true,
      userId: 12,
      accountDeleted: false,
    });
    const res = await adminTool("remove_user").handler({ userId: 12 }, ADMIN);
    expect(removeUserFromOrganization).toHaveBeenCalledWith(3, 12);
    expect(removeUserById).not.toHaveBeenCalled();
    // accountDeleted would reveal whether the user belongs to other organizations.
    expect(payload(res)).toEqual({ removed: true, userId: 12, organizationId: 3 });
  });
});

describe("mcp/tools/users — super admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRoleByName as jest.Mock<any>).mockResolvedValue({ id: 3, name: "Editor" });
  });

  it("invite_user is trusted, with no role ceiling", async () => {
    (organizationExists as jest.Mock<any>).mockResolvedValue(true);
    (inviteUserToOrganization as jest.Mock<any>).mockResolvedValue({
      emailSent: false,
      error: "smtp down",
      link: "https://x/invite",
    });
    const res = await superAdminTool("invite_user").handler(
      { organizationId: 5, email: "a@b.co", firstName: "Ann", role: "Editor" },
      SUPER_ADMIN,
    );
    expect(inviteUserToOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 5, invitedBy: 7, inviterRole: null }),
    );
    expect(payload(res)).toEqual({
      email: "a@b.co",
      role: "Editor",
      organizationId: 5,
      emailSent: false,
      emailError: "smtp down",
      invitationLink: "https://x/invite",
    });
  });

  it("invite_user refuses an organization that does not exist", async () => {
    (organizationExists as jest.Mock<any>).mockResolvedValue(false);
    await expect(
      superAdminTool("invite_user").handler(
        { organizationId: 99, email: "a@b.co", firstName: "Ann", role: "Editor" },
        SUPER_ADMIN,
      ),
    ).rejects.toThrow("No organization with id 99 on this deployment.");
    expect(inviteUserToOrganization).not.toHaveBeenCalled();
  });

  /** delete_user removes the account everywhere; this removes one membership. */
  it("remove_user removes one membership and reports whether the account went too", async () => {
    (organizationExists as jest.Mock<any>).mockResolvedValue(true);
    (removeUserFromOrganization as jest.Mock<any>).mockResolvedValue({
      removed: true,
      userId: 12,
      accountDeleted: false,
    });
    const res = await superAdminTool("remove_user").handler(
      { organizationId: 5, userId: 12 },
      SUPER_ADMIN,
    );
    expect(removeUserFromOrganization).toHaveBeenCalledWith(5, 12);
    expect(removeUserById).not.toHaveBeenCalled();
    expect(payload(res)).toEqual({ removed: true, userId: 12, accountDeleted: false });
  });

  it("remove_user refuses an organization that does not exist", async () => {
    (organizationExists as jest.Mock<any>).mockResolvedValue(false);
    await expect(
      superAdminTool("remove_user").handler({ organizationId: 99, userId: 12 }, SUPER_ADMIN),
    ).rejects.toThrow("No organization with id 99 on this deployment.");
    expect(removeUserFromOrganization).not.toHaveBeenCalled();
  });

  it("list_invitations lists the organization's pending invitations", async () => {
    (organizationExists as jest.Mock<any>).mockResolvedValue(true);
    (getInvitationsByOrganizationQuery as jest.Mock<any>).mockResolvedValue([
      { id: 1, email: "a@b.co", status: "pending" },
    ]);
    const res = await superAdminTool("list_invitations").handler(
      { organizationId: 5 },
      SUPER_ADMIN,
    );
    expect(getInvitationsByOrganizationQuery).toHaveBeenCalledWith(5);
    expect(payload(res)).toEqual({
      organizationId: 5,
      count: 1,
      invitations: [{ id: 1, email: "a@b.co", status: "pending" }],
    });
  });

  /** An empty list would otherwise read as "no pending invitations". */
  it("list_invitations refuses an organization that does not exist", async () => {
    (organizationExists as jest.Mock<any>).mockResolvedValue(false);
    await expect(
      superAdminTool("list_invitations").handler({ organizationId: 99 }, SUPER_ADMIN),
    ).rejects.toThrow("No organization with id 99 on this deployment.");
    expect(getInvitationsByOrganizationQuery).not.toHaveBeenCalled();
  });
});
