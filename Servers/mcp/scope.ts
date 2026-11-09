/**
 * Organization scoping for the hosted MCP server.
 *
 * Governance data is scoped by organization_id, so each governance tool takes
 * an organizationId and checks it here before touching anything. An unchecked
 * id would otherwise read back as an empty list, which the model would report
 * as "that organization has no risks" rather than "there is no such
 * organization".
 *
 * Those tools are offered only to organization Admins, pinned to their own
 * organization: scopeToOrganization removes the argument and supplies the
 * token's organization instead, so no other organization can be named.
 */

import { organizationExists } from "../utils/superAdmin.utils";
import type { ToolDef } from "./tool";

export async function requireOrganization(organizationId: number): Promise<void> {
  if (!(await organizationExists(organizationId))) {
    throw new Error(`No organization with id ${organizationId} on this deployment.`);
  }
}

/**
 * The tool with its organizationId argument fixed to one organization.
 *
 * The argument leaves the input schema, so it is neither offered to the model
 * nor accepted from it; a tool without one is returned unchanged.
 */
export function scopeToOrganization(tool: ToolDef, organizationId: number): ToolDef {
  if (!("organizationId" in tool.inputSchema)) return tool;
  const inputSchema = { ...tool.inputSchema };
  delete inputSchema.organizationId;
  return {
    ...tool,
    inputSchema,
    handler: (args, caller) => tool.handler({ ...args, organizationId }, caller),
  };
}
