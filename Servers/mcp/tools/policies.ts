/**
 * Policy tools.
 *
 * Reads call the same query as the console's policy list (policy.ctrl.ts), so
 * the model sees what the console shows. The organizationId is fixed to the
 * calling Admin's organization by mcp/scope.ts.
 */

import { z } from "zod";
import { getAllPoliciesQuery } from "../../utils/policyManager.utils";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const listPolicies: ToolDef = {
  name: "list_policies",
  title: "List policies",
  description:
    "List an organization's policies: title, status, tags, author, owner, assigned reviewers, review status, next review date, and the policy text as HTML.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const policies = await getAllPoliciesQuery(args.organizationId);
    return result({ organizationId: args.organizationId, count: policies.length, policies });
  },
};

export const policyTools: ToolDef[] = [listPolicies];
