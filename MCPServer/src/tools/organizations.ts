/**
 * Organization tools — Servers/routes/superAdmin.route.ts.
 */

import { z } from "zod";
import { request } from "../client.js";
import { deploymentLabel, resolveProfile } from "../config.js";
import { generatePassword } from "../password.js";
import { resolveRoleId } from "../roles.js";
import { profileArg, result, type ToolDef } from "../tool.js";

interface Organization {
  id: number;
  name: string;
  logo: string | null;
  created_at: string;
  onboarding_status: string | null;
  user_count: string;
}

const createOrganizationWithAdmin: ToolDef = {
  name: "create_organization_with_admin",
  title: "Create organization with admin",
  description:
    "Create a new VerifyWise organization together with its first Admin user, generating a random password for that user. The organization and user are created in a single transaction. Returns the generated password, which is shown only once and is not recoverable afterwards.",
  inputSchema: {
    profile: profileArg,
    organizationName: z.string().min(2).max(255).describe("Name of the new organization."),
    adminEmail: z.string().email().describe("Email address of the organization's Admin user."),
    adminFirstName: z.string().min(1).describe("Admin user's first name."),
    adminLastName: z.string().min(1).describe("Admin user's last name."),
    logo: z.string().url().optional().describe("Optional URL of the organization's logo."),
  },
  handler: async (args) => {
    const profile = resolveProfile(args.profile);
    const role = await resolveRoleId(profile, "Admin");
    const password = generatePassword();

    const { data } = await request<{ organizationId: number }>(
      profile,
      "POST",
      "/api/super-admin/organizations-with-user",
      {
        orgName: args.organizationName,
        logo: args.logo,
        mode: "direct",
        user: {
          email: args.adminEmail,
          name: args.adminFirstName,
          surname: args.adminLastName,
          roleId: role.id,
          password,
        },
      },
    );

    return result({
      organizationId: data.organizationId,
      organizationName: args.organizationName,
      adminEmail: args.adminEmail,
      role: role.name,
      password,
      note: "This password is not stored anywhere and cannot be retrieved again.",
    });
  },
};

const listOrganizations: ToolDef = {
  name: "list_organizations",
  title: "List organizations",
  description:
    "List every organization on a VerifyWise deployment, with its user count and creation date.",
  inputSchema: { profile: profileArg },
  handler: async (args) => {
    const profile = resolveProfile(args.profile);
    const { data } = await request<Organization[]>(
      profile,
      "GET",
      "/api/super-admin/organizations",
    );

    return result({
      count: data.length,
      organizations: data,
    });
  },
};

const updateOrganization: ToolDef = {
  name: "update_organization",
  title: "Update organization",
  description: "Rename an organization or change its logo.",
  inputSchema: {
    profile: profileArg,
    organizationId: z.number().int().positive().describe("Id of the organization to update."),
    name: z.string().min(2).max(255).optional().describe("New organization name."),
    logo: z.string().url().optional().describe("New logo URL."),
  },
  handler: async (args) => {
    if (args.name === undefined && args.logo === undefined) {
      throw new Error("Provide a name or a logo to update.");
    }
    const profile = resolveProfile(args.profile);
    const { data } = await request<Organization>(
      profile,
      "PATCH",
      `/api/super-admin/organizations/${args.organizationId}`,
      { name: args.name, logo: args.logo },
    );

    return result({ organization: data });
  },
};

const deleteOrganization: ToolDef = {
  name: "delete_organization",
  title: "Delete organization",
  description:
    "Permanently delete an organization and every user in it. Requires the organization's exact name as confirmation. This cannot be undone.",
  inputSchema: {
    profile: profileArg,
    organizationId: z.number().int().positive().describe("Id of the organization to delete."),
    confirmOrganizationName: z
      .string()
      .min(1)
      .describe(
        "The exact current name of the organization being deleted. The deletion is refused unless this matches.",
      ),
  },
  handler: async (args) => {
    const profile = resolveProfile(args.profile);

    // The delete cascades through every user and all organization data, so the
    // id is checked against the name the caller believes it belongs to before
    // anything is removed. A wrong id here is not recoverable.
    const { data: organizations } = await request<Organization[]>(
      profile,
      "GET",
      "/api/super-admin/organizations",
    );
    const target = organizations.find((org) => org.id === args.organizationId);

    if (!target) {
      throw new Error(
        `No organization with id ${args.organizationId} on ${deploymentLabel(profile)}.`,
      );
    }
    if (target.name !== args.confirmOrganizationName) {
      throw new Error(
        `Refusing to delete: organization ${target.id} on ${profile.name} is named "${target.name}", not "${args.confirmOrganizationName}".`,
      );
    }

    const { data } = await request<{ deleted: boolean; usersRemoved: number }>(
      profile,
      "DELETE",
      `/api/super-admin/organizations/${args.organizationId}`,
    );

    return result({
      deletedOrganization: { id: target.id, name: target.name },
      usersRemoved: data.usersRemoved,
    });
  },
};

export const organizationTools: ToolDef[] = [
  createOrganizationWithAdmin,
  listOrganizations,
  updateOrganization,
  deleteOrganization,
];
