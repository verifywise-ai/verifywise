/**
 * Organization scoping for the hosted MCP server.
 *
 * The organization and user tools need no target: a super admin's token is not
 * tied to an organization, and those tools act on the deployment as a whole.
 * Governance data is different — every row is scoped by organization_id — so
 * each governance tool takes an explicit organizationId and checks it here
 * before touching anything. An unchecked id would otherwise read back as an
 * empty list, which the model would report as "that organization has no risks"
 * rather than "there is no such organization".
 */

import { organizationExists } from "../utils/superAdmin.utils";

export async function requireOrganization(organizationId: number): Promise<void> {
  if (!(await organizationExists(organizationId))) {
    throw new Error(`No organization with id ${organizationId} on this deployment.`);
  }
}
