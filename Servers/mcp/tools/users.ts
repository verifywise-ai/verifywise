/**
 * User tools.
 *
 * Handlers call services/superAdmin.service.ts — the same code the super-admin
 * console controllers call — so each operation has one implementation
 * regardless of whether it was reached over REST or MCP.
 */

import { z } from "zod";
import {
  createUserInOrganization,
  removeUserById,
  updateUserDetails,
} from "../../services/superAdmin.service";
import {
  listAllUsersQuery,
  listOrganizationUsersQuery,
  organizationExists,
  userExistsByEmail,
} from "../../utils/superAdmin.utils";
import {
  InviteRefusalError,
  inviteUserToOrganization,
  type InviteRefusalCode,
} from "../../services/invitation.service";
import { getRoleByName } from "../../utils/roleMap";
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
    "Create a user inside an existing organization with a randomly generated password. The user is active immediately — no invitation email is sent. Returns the generated password, which is shown only once and is not recoverable afterwards.",
  inputSchema: {
    organizationId: z
      .number()
      .int()
      .positive()
      .describe("Id of the organization the user belongs to."),
    email: z.string().email().describe("The user's email address. Must be unused."),
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
        "The user's organization, used only to resolve a custom role name. Omit unless the organization defines its own roles.",
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

    const role =
      args.role === undefined
        ? undefined
        : await resolveRole(args.organizationId ?? null, args.role);

    const user = await updateUserDetails(args.userId, {
      name: args.firstName,
      surname: args.lastName,
      email: args.email,
      roleId: role?.id,
    });

    return result({ user });
  },
};

const deleteUser: ToolDef = {
  name: "delete_user",
  title: "Delete user",
  description:
    "Permanently delete a user and remove them from their organization. This cannot be undone.",
  inputSchema: {
    userId: z.number().int().positive().describe("Id of the user to delete."),
  },
  handler: async (args) => {
    return result(await removeUserById(args.userId));
  },
};

/** Refusal codes from the invitation service, as sentences the model can act on. */
const INVITE_REFUSALS: Record<InviteRefusalCode, string> = {
  unknown_role: "That role does not exist on this deployment.",
  exceeds_access: "The invitation grants more access than the inviter has.",
  cannot_replace: "A pending invitation exists for a role above the inviter's own.",
  conflict: "The pending invitation was changed by someone else. Try again.",
};

const inviteUser: ToolDef = {
  name: "invite_user",
  title: "Invite user",
  description:
    "Invite a user to an existing organization by email. They set their own password through the invitation link, so no password is generated. The invitation expires after one week.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization to invite into."),
    email: z.string().email().describe("The invitee's email address. Must be unused."),
    firstName: z.string().min(1).describe("The invitee's first name."),
    lastName: z.string().min(1).optional().describe("The invitee's last name."),
    role: roleArg,
  },
  handler: async (args, caller) => {
    // The same pre-checks the super-admin console runs before inviting.
    if (!(await organizationExists(args.organizationId))) {
      throw new Error(`No organization with id ${args.organizationId} on this deployment.`);
    }
    if (await userExistsByEmail(args.email)) {
      throw new Error(`A user with the email ${args.email} already exists.`);
    }

    const role = await resolveRole(args.organizationId, args.role);

    let invitation;
    try {
      invitation = await inviteUserToOrganization({
        organizationId: args.organizationId,
        email: args.email,
        name: args.firstName,
        surname: args.lastName,
        roleId: role.id,
        invitedBy: caller.userId,
        // Trusted: superAdminOnly already verified the caller, so no role
        // ceiling applies — the same footing the super-admin route uses.
        inviterRole: null,
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
  },
};

export const userTools: ToolDef[] = [createUser, inviteUser, listUsers, updateUser, deleteUser];
