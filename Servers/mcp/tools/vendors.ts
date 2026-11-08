/**
 * Vendor tools.
 *
 * Reads call the same query as the console's vendor list (vendor.ctrl.ts), so
 * the model sees what the console shows. The organizationId is fixed to the
 * calling Admin's organization by mcp/scope.ts.
 */

import { z } from "zod";
import { getAllVendorsQuery } from "../../utils/vendor.utils";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const listVendors: ToolDef = {
  name: "list_vendors",
  title: "List vendors",
  description:
    "List an organization's AI vendors: what each provides, its contact person, assignee and reviewer, its review status, result and date, its risk score, and the ids of the use cases it is linked to.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const vendors = await getAllVendorsQuery(args.organizationId);
    return result({ organizationId: args.organizationId, count: vendors.length, vendors });
  },
};

export const vendorTools: ToolDef[] = [listVendors];
