/**
 * Organization tools.
 *
 * Handlers call services/superAdmin.service.ts — the same code the super-admin
 * console controllers call — so each operation has one implementation
 * regardless of whether it was reached over REST or MCP.
 */

import { z } from "zod";
import {
  createOrganizationWithUser,
  deleteOrganization,
  updateOrganization,
} from "../../services/superAdmin.service";
import { listOrganizationsQuery } from "../../utils/superAdmin.utils";
import { getRoleByName } from "../../utils/roleMap";
import { generatePassword } from "../password";
import { result, type ToolDef } from "../tool";

const createOrganizationWithAdmin: ToolDef = {
  name: "create_organization_with_admin",
  title: "Create organization with admin",
  description:
    "Create a new VerifyWise organization together with its first Admin user, generating a random password for that user. The organization and user are created in a single transaction. Returns the generated password, which is shown only once and is not recoverable afterwards.",
  inputSchema: {
    organizationName: z.string().min(2).max(255).describe("Name of the new organization."),
    adminEmail: z.string().email().describe("Email address of the organization's Admin user."),
    adminFirstName: z.string().min(1).describe("Admin user's first name."),
    adminLastName: z.string().min(1).describe("Admin user's last name."),
    logo: z.string().url().optional().describe("Optional URL of the organization's logo."),
  },
  handler: async (args, caller) => {
    // Resolved from the roles table rather than hardcoded: a role renamed
    // there would silently break a baked-in id.
    const role = await getRoleByName(null, "Admin");
    if (!role) {
      throw new Error('No built-in "Admin" role exists on this deployment.');
    }

    const password = generatePassword();
    const { organizationId } = await createOrganizationWithUser({
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
      invitedBy: caller.userId,
    });

    return result({
      organizationId,
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
    "List every organization on this VerifyWise deployment, with its user count and creation date.",
  inputSchema: {},
  handler: async () => {
    const organizations = await listOrganizationsQuery();
    return result({ count: organizations.length, organizations });
  },
};

const updateOrganizationTool: ToolDef = {
  name: "update_organization",
  title: "Update organization",
  description: "Rename an organization or change its logo.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization to update."),
    name: z.string().min(2).max(255).optional().describe("New organization name."),
    logo: z.string().url().optional().describe("New logo URL."),
  },
  handler: async (args) => {
    if (args.name === undefined && args.logo === undefined) {
      throw new Error("Provide a name or a logo to update.");
    }
    const organization = await updateOrganization(args.organizationId, {
      name: args.name,
      logo: args.logo,
    });
    if (!organization) {
      throw new Error(`No organization with id ${args.organizationId} on this deployment.`);
    }
    return result({ organization });
  },
};

const deleteOrganizationTool: ToolDef = {
  name: "delete_organization",
  title: "Delete organization",
  description:
    "Permanently delete an organization and every user in it. Requires the organization's exact name as confirmation. This cannot be undone.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization to delete."),
    confirmOrganizationName: z
      .string()
      .min(1)
      .describe(
        "The exact current name of the organization being deleted. The deletion is refused unless this matches.",
      ),
  },
  handler: async (args) => {
    // The delete cascades through every user and all organization data, so the
    // id is checked against the name the caller believes it belongs to before
    // anything is removed. A wrong id here is not recoverable.
    const organizations = await listOrganizationsQuery();
    const target = organizations.find((org) => org.id === args.organizationId);

    if (!target) {
      throw new Error(`No organization with id ${args.organizationId} on this deployment.`);
    }
    if (target.name !== args.confirmOrganizationName) {
      throw new Error(
        `Refusing to delete: organization ${target.id} is named "${target.name}", not "${args.confirmOrganizationName}".`,
      );
    }

    const { usersRemoved } = await deleteOrganization(args.organizationId);
    return result({
      deletedOrganization: { id: target.id, name: target.name },
      usersRemoved,
    });
  },
};

export const organizationTools: ToolDef[] = [
  createOrganizationWithAdmin,
  listOrganizations,
  updateOrganizationTool,
  deleteOrganizationTool,
];
