/**
 * User tools — Servers/routes/superAdmin.route.ts.
 */

import { z } from "zod";
import { request } from "../client.js";
import { resolveProfile } from "../config.js";
import { generatePassword } from "../password.js";
import { resolveRoleId } from "../roles.js";
import { profileArg, result, type ToolDef } from "../tool.js";

interface User {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number;
  role_name: string | null;
  organization_id?: number;
  organization_name?: string;
  created_at: string;
  last_login: string | null;
}

const roleArg = z
  .string()
  .min(1)
  .describe('Role name, for example "Admin", "Editor", "Reviewer" or "Auditor".');

const createUser: ToolDef = {
  name: "create_user",
  title: "Create user",
  description:
    "Create a user inside an existing organization with a randomly generated password. The user is active immediately — no invitation email is sent. Returns the generated password, which is shown only once and is not recoverable afterwards.",
  inputSchema: {
    profile: profileArg,
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
    const profile = resolveProfile(args.profile);
    const role = await resolveRoleId(profile, args.role);
    const password = generatePassword();

    const { data } = await request<User>(
      profile,
      "POST",
      `/api/super-admin/organizations/${args.organizationId}/users`,
      {
        email: args.email,
        name: args.firstName,
        surname: args.lastName,
        password,
        roleId: role.id,
      },
    );

    return result({
      userId: data.id,
      email: data.email,
      role: role.name,
      organizationId: args.organizationId,
      password,
      note: "This password is not stored anywhere and cannot be retrieved again.",
    });
  },
};

const inviteUser: ToolDef = {
  name: "invite_user",
  title: "Invite user",
  description:
    "Invite a user to an existing organization by email. They set their own password through the invitation link, so no password is generated. The invitation expires after one week.",
  inputSchema: {
    profile: profileArg,
    organizationId: z.number().int().positive().describe("Id of the organization to invite into."),
    email: z.string().email().describe("The invitee's email address. Must be unused."),
    firstName: z.string().min(1).describe("The invitee's first name."),
    lastName: z.string().min(1).optional().describe("The invitee's last name."),
    role: roleArg,
  },
  handler: async (args) => {
    const profile = resolveProfile(args.profile);
    const role = await resolveRoleId(profile, args.role);

    const { status, data } = await request<{ error?: string; link?: string }>(
      profile,
      "POST",
      `/api/super-admin/organizations/${args.organizationId}/invite`,
      {
        email: args.email,
        name: args.firstName,
        surname: args.lastName,
        roleId: role.id,
      },
    );

    // 206: the invitation row was written but the email could not be sent. The
    // link is returned so it can be passed on by hand.
    if (status === 206) {
      return result({
        email: args.email,
        role: role.name,
        organizationId: args.organizationId,
        emailSent: false,
        emailError: data?.error,
        invitationLink: data?.link,
      });
    }

    return result({
      email: args.email,
      role: role.name,
      organizationId: args.organizationId,
      emailSent: true,
    });
  },
};

const listUsers: ToolDef = {
  name: "list_users",
  title: "List users",
  description:
    "List users on a deployment. Pass an organizationId to list only that organization's users, or omit it to list every user across all organizations.",
  inputSchema: {
    profile: profileArg,
    organizationId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Restrict the listing to a single organization."),
  },
  handler: async (args) => {
    const profile = resolveProfile(args.profile);
    const path =
      args.organizationId === undefined
        ? "/api/super-admin/users"
        : `/api/super-admin/organizations/${args.organizationId}/users`;

    const { data } = await request<User[]>(profile, "GET", path);

    return result({
      organizationId: args.organizationId,
      count: data.length,
      users: data,
    });
  },
};

const updateUser: ToolDef = {
  name: "update_user",
  title: "Update user",
  description: "Change a user's name, email or role.",
  inputSchema: {
    profile: profileArg,
    userId: z.number().int().positive().describe("Id of the user to update."),
    firstName: z.string().min(1).optional().describe("New first name."),
    lastName: z.string().min(1).optional().describe("New last name."),
    email: z.string().email().optional().describe("New email address."),
    role: z.string().min(1).optional().describe("New role name."),
  },
  handler: async (args) => {
    if (
      args.firstName === undefined &&
      args.lastName === undefined &&
      args.email === undefined &&
      args.role === undefined
    ) {
      throw new Error("Provide at least one of firstName, lastName, email or role.");
    }

    const profile = resolveProfile(args.profile);
    const role = args.role === undefined ? undefined : await resolveRoleId(profile, args.role);

    const { data } = await request<User>(
      profile,
      "PATCH",
      `/api/super-admin/users/${args.userId}`,
      {
        name: args.firstName,
        surname: args.lastName,
        email: args.email,
        roleId: role?.id,
      },
    );

    return result({ user: data });
  },
};

const deleteUser: ToolDef = {
  name: "delete_user",
  title: "Delete user",
  description: "Permanently delete a user from their organization. This cannot be undone.",
  inputSchema: {
    profile: profileArg,
    userId: z.number().int().positive().describe("Id of the user to delete."),
  },
  handler: async (args) => {
    const profile = resolveProfile(args.profile);
    const { data } = await request<{ deleted: boolean; userId: number }>(
      profile,
      "DELETE",
      `/api/super-admin/users/${args.userId}`,
    );

    return result({ deletedUserId: data.userId });
  },
};

export const userTools: ToolDef[] = [createUser, inviteUser, listUsers, updateUser, deleteUser];
