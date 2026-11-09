/**
 * User tools.
 *
 * Handlers call services/superAdmin.service.ts — the same code the super-admin
 * console controllers call — so each operation has one implementation
 * regardless of whether it was reached over REST or MCP.
 *
 * userTools act on the whole deployment and are for super admins.
 * organizationUserTools are an organization Admin's: each takes an
 * organizationId that mcp/scope.ts fixes to the Admin's own organization, and
 * none can create a password or delete an account, matching what an Admin can
 * do from the Team settings.
 */

import { z } from "zod";
import {
  createUserInOrganization,
  removeUserById,
  removeUserFromOrganization,
  updateUserDetails,
} from "../../services/superAdmin.service";
import {
  listAllUsersQuery,
  listOrganizationUsersQuery,
  organizationExists,
} from "../../utils/superAdmin.utils";
import {
  InviteRefusalError,
  inviteUserToOrganization,
  type InviteRefusalCode,
} from "../../services/invitation.service";
import { getRoleByName } from "../../utils/roleMap";
import { getInvitationsByOrganizationQuery } from "../../utils/invitation.utils";
import { generatePassword } from "../password";
import { result, type ToolDef } from "../tool";

const roleArg = z
  .string()
  .min(1)
  .describe('Role name, for example "Admin", "Editor", "Reviewer" or "Auditor".');

/**
 * Resolve a role name against the roles table for one organization.
 *
 * Not hardcoded: a role renamed or added there would silently break a baked-in
 * mapping. Custom org-scoped roles shadow built-ins of the same name.
 */
async function resolveRole(organizationId: number | null, roleName: string) {
  const role = await getRoleByName(organizationId, roleName.trim());
  if (!role) {
    throw new Error(`Unknown role "${roleName}" on this deployment.`);
  }
  return role;
}

const createUser: ToolDef = {
  name: "create_user",
  title: "Create user",
  description:
    "Create a user inside an existing organization with a randomly generated password. The user is active immediately — no invitation email is sent. Returns the generated password, which is shown only once and is not recoverable afterwards. If the email already has an account, that account is added to the organization instead and keeps its own password.",
  inputSchema: {
    organizationId: z
      .number()
      .int()
      .positive()
      .describe("Id of the organization the user belongs to."),
    email: z.string().email().describe("The user's email address."),
    firstName: z.string().min(1).describe("The user's first name."),
    lastName: z.string().min(1).describe("The user's last name."),
    role: roleArg,
  },
  handler: async (args) => {
    const role = await resolveRole(args.organizationId, args.role);
    const password = generatePassword();

    const user = await createUserInOrganization({
      organizationId: args.organizationId,
      email: args.email,
      name: args.firstName,
      surname: args.lastName,
      password,
      roleId: role.id,
    });

    if (user.existing_account) {
      return result({
        userId: user.id,
        email: user.email,
        role: role.name,
        organizationId: args.organizationId,
        note: "This email already had an account. It was added to the organization and keeps its own password.",
      });
    }

    return result({
      userId: user.id,
      email: user.email,
      role: role.name,
      organizationId: args.organizationId,
      password,
      note: "This password is not stored anywhere and cannot be retrieved again.",
    });
  },
};

const listUsers: ToolDef = {
  name: "list_users",
  title: "List users",
  description:
    "List users on this deployment. Pass an organizationId to list only that organization's users, or omit it to list every user across all organizations.",
  inputSchema: {
    organizationId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Restrict the listing to a single organization."),
  },
  handler: async (args) => {
    const users =
      args.organizationId === undefined
        ? await listAllUsersQuery()
        : await listOrganizationUsersQuery(args.organizationId);

    return result({ organizationId: args.organizationId, count: users.length, users });
  },
};

const updateUser: ToolDef = {
  name: "update_user",
  title: "Update user",
  description: "Change a user's name, email or role.",
  inputSchema: {
    userId: z.number().int().positive().describe("Id of the user to update."),
    firstName: z.string().min(1).optional().describe("New first name."),
    lastName: z.string().min(1).optional().describe("New last name."),
    email: z.string().email().optional().describe("New email address."),
    role: roleArg.optional().describe("New role name."),
    organizationId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "The organization whose role to change. A user can belong to several organizations, with a role in each: required with role.",
      ),
  },
  handler: async (args) => {
    if (
      args.firstName === undefined &&
      args.lastName === undefined &&
      args.email === undefined &&
      args.role === undefined
    ) {
      throw new Error("Provide a name, email or role to update.");
    }

    if (args.role !== undefined && args.organizationId === undefined) {
      throw new Error("Provide the organizationId whose role to change.");
    }
    const role =
      args.role === undefined ? undefined : await resolveRole(args.organizationId!, args.role);

    const user = await updateUserDetails(args.userId, {
      name: args.firstName,
      surname: args.lastName,
      email: args.email,
      roleId: role?.id,
      organizationId: args.organizationId,
    });

    return result({ user });
  },
};

const deleteUser: ToolDef = {
  name: "delete_user",
  title: "Delete user",
  description:
    "Permanently delete a user's account, removing them from every organization they belong to. This cannot be undone.",
  inputSchema: {
    userId: z.number().int().positive().describe("Id of the user to delete."),
  },
  handler: async (args) => {
    return result(await removeUserById(args.userId));
  },
};

/**
 * Fails naming the id, the same pre-check invite_user runs: an unknown
 * organization would otherwise read as an empty list, or as "not a member".
 */
async function requireExistingOrganization(organizationId: number): Promise<void> {
  if (!(await organizationExists(organizationId))) {
    throw new Error(`No organization with id ${organizationId} on this deployment.`);
  }
}

const removeUserFromOrganizationTool: ToolDef = {
  name: "remove_user",
  title: "Remove user from organization",
  description:
    "Remove a user from one organization, leaving their other memberships alone. Their account is deleted only if this was the last organization they belonged to. The organization must keep at least one Admin. To delete an account from every organization, use delete_user.",
  inputSchema: {
    organizationId: z
      .number()
      .int()
      .positive()
      .describe("Id of the organization to remove the user from."),
    userId: z.number().int().positive().describe("Id of the user to remove."),
  },
  handler: async (args) => {
    await requireExistingOrganization(args.organizationId);
    return result(await removeUserFromOrganization(args.organizationId, args.userId));
  },
};

const listInvitations: ToolDef = {
  name: "list_invitations",
  title: "List invitations",
  description:
    "List an organization's pending invitations: who was invited, with which role, by whom, and when the invitation expires.",
  inputSchema: {
    organizationId: z
      .number()
      .int()
      .positive()
      .describe("Id of the organization whose invitations to list."),
  },
  handler: async (args) => {
    await requireExistingOrganization(args.organizationId);
    const invitations = await getInvitationsByOrganizationQuery(args.organizationId);
    return result({ organizationId: args.organizationId, count: invitations.length, invitations });
  },
};

/** Refusal codes from the invitation service, as sentences the model can act on. */
const INVITE_REFUSALS: Record<InviteRefusalCode, string> = {
  unknown_role: "That role does not exist on this deployment.",
  exceeds_access: "The invitation grants more access than the inviter has.",
  cannot_replace: "A pending invitation exists for a role above the inviter's own.",
  conflict: "The pending invitation was changed by someone else. Try again.",
  already_member: "That user is already a member of this organization.",
  super_admin: "That email belongs to a super admin, who cannot join an organization.",
};

const inviteArgs = {
  email: z.string().email().describe("The invitee's email address."),
  firstName: z.string().min(1).describe("The invitee's first name."),
  lastName: z.string().min(1).optional().describe("The invitee's last name."),
  role: roleArg,
};

const INVITE_DESCRIPTION =
  "Invite a user to an existing organization by email. A new user sets their own password through the invitation link, so no password is generated; an existing user joins by logging in through the link with their own password. The invitation expires after one week.";

/**
 * Invite into one organization through the invitation service.
 *
 * inviterRole null is the trusted footing of a verified super admin, with no
 * role ceiling; an Admin passes their own role, as the Team settings do.
 */
async function invite(args: Record<string, any>, invitedBy: number, inviterRole: string | null) {
  const role = await resolveRole(args.organizationId, args.role);

  let invitation;
  try {
    invitation = await inviteUserToOrganization({
      organizationId: args.organizationId,
      email: args.email,
      name: args.firstName,
      surname: args.lastName,
      roleId: role.id,
      invitedBy,
      inviterRole,
    });
  } catch (error) {
    if (error instanceof InviteRefusalError) {
      throw new Error(INVITE_REFUSALS[error.code]);
    }
    throw error;
  }

  // An invitation that saved but could not be emailed still works; the link
  // is returned so it can be passed on by hand.
  return invitation.emailSent
    ? result({
        email: args.email,
        role: role.name,
        organizationId: args.organizationId,
        emailSent: true,
      })
    : result({
        email: args.email,
        role: role.name,
        organizationId: args.organizationId,
        emailSent: false,
        emailError: invitation.error,
        invitationLink: invitation.link,
      });
}

const inviteUser: ToolDef = {
  name: "invite_user",
  title: "Invite user",
  description: INVITE_DESCRIPTION,
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization to invite into."),
    ...inviteArgs,
  },
  handler: async (args, caller) => {
    // The same pre-check the super-admin console runs before inviting.
    await requireExistingOrganization(args.organizationId);
    // Trusted: the caller is a verified super admin, so no role ceiling
    // applies — the same footing the super-admin route uses.
    return invite(args, caller.userId, null);
  },
};

export const userTools: ToolDef[] = [
  createUser,
  inviteUser,
  listInvitations,
  listUsers,
  updateUser,
  removeUserFromOrganizationTool,
  deleteUser,
];

const organizationIdArg = z
  .number()
  .int()
  .positive()
  .describe("Id of the organization whose members to manage.");

const listOrganizationUsers: ToolDef = {
  name: "list_users",
  title: "List users",
  description: "List the members of the organization, with each one's role.",
  inputSchema: { organizationId: organizationIdArg },
  handler: async (args) => {
    const users = await listOrganizationUsersQuery(args.organizationId);
    return result({ organizationId: args.organizationId, count: users.length, users });
  },
};

const inviteOrganizationUser: ToolDef = {
  name: "invite_user",
  title: "Invite user",
  description: INVITE_DESCRIPTION,
  inputSchema: { organizationId: organizationIdArg, ...inviteArgs },
  handler: async (args, caller) => invite(args, caller.userId, caller.role),
};

const updateUserRole: ToolDef = {
  name: "update_user_role",
  title: "Update user role",
  description:
    "Change a member's role in the organization. The organization must keep at least one Admin. Names and email addresses belong to the person and are changed only by them.",
  inputSchema: {
    organizationId: organizationIdArg,
    userId: z.number().int().positive().describe("Id of the member whose role to change."),
    role: roleArg.describe("New role name."),
  },
  handler: async (args) => {
    const role = await resolveRole(args.organizationId, args.role);
    // The service answers with every organization the user belongs to; an
    // Admin is shown their own organization's membership only.
    const { id, name, surname, email } = await updateUserDetails(args.userId, {
      roleId: role.id,
      organizationId: args.organizationId,
    });
    return result({
      user: { id, name, surname, email, organizationId: args.organizationId, role: role.name },
    });
  },
};

const removeUser: ToolDef = {
  name: "remove_user",
  title: "Remove user",
  description:
    "Remove a member from the organization. Their account is deleted only if this was the last organization they belonged to. The organization must keep at least one Admin.",
  inputSchema: {
    organizationId: organizationIdArg,
    userId: z.number().int().positive().describe("Id of the member to remove."),
  },
  handler: async (args) => {
    // Whether the account went too would tell the Admin if the user belongs to
    // other organizations, so only the removal is reported, as on REST.
    await removeUserFromOrganization(args.organizationId, args.userId);
    return result({ removed: true, userId: args.userId, organizationId: args.organizationId });
  },
};

export const organizationUserTools: ToolDef[] = [
  inviteOrganizationUser,
  listOrganizationUsers,
  updateUserRole,
  removeUser,
];
