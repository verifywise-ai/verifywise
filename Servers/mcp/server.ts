/**
 * The deployment's own MCP server.
 *
 * Exposes administration — organizations, users, and the governance data
 * inside them — over Streamable HTTP at /api/mcp, so an MCP client connects to
 * the deployment directly:
 *
 *   claude mcp add --transport http verifywise \
 *     https://<deployment>/api/mcp --header "Authorization: Bearer <api token>"
 *
 * Nothing is installed anywhere. Auth is the deployment's existing API token,
 * checked by authenticateJWT and routes/mcp.route.ts before a tool ever runs,
 * so the token never reaches the model and no credential is stored on disk.
 *
 * A super admin administers the deployment: organizations and the users in
 * them. An organization Admin gets their own organization's users and
 * governance data, with no organizationId to name: it is fixed to the token's
 * organization. Governance data is not a super-admin tool: the SuperAdmin role
 * holds no use case or risk permission over REST, and the tenant isolation
 * runbook allows no super-admin write into another organization
 * (docs/technical/security/tenant-isolation.md §3).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { organizationTools } from "./tools/organizations";
import { organizationUserTools, userTools } from "./tools/users";
import { useCaseTools } from "./tools/useCases";
import { riskTools } from "./tools/risks";
import { complianceTools } from "./tools/compliance";
import { vendorTools } from "./tools/vendors";
import { policyTools } from "./tools/policies";
import { modelTools } from "./tools/models";
import { incidentTools } from "./tools/incidents";
import { taskTools } from "./tools/tasks";
import { trainingTools } from "./tools/trainings";
import { datasetTools } from "./tools/datasets";
import { scopeToOrganization } from "./scope";
import type { McpCaller, ToolDef } from "./tool";

const superAdminTools: ToolDef[] = [...organizationTools, ...userTools];

const organizationAdminTools: ToolDef[] = [
  ...organizationUserTools,
  ...useCaseTools,
  ...riskTools,
  ...complianceTools,
  ...vendorTools,
  ...policyTools,
  ...modelTools,
  ...incidentTools,
  ...taskTools,
  ...trainingTools,
  ...datasetTools,
];

function toolsFor(caller: McpCaller): ToolDef[] {
  const tools: ToolDef[] = [];
  if (caller.isSuperAdmin) {
    tools.push(...superAdminTools);
  }
  if (caller.role === "Admin" && caller.organizationId) {
    const organizationId = caller.organizationId;
    // A super admin already has these names, unscoped; only the rest are added.
    const taken = new Set(tools.map((tool) => tool.name));
    tools.push(
      ...organizationAdminTools
        .filter((tool) => !taken.has(tool.name))
        .map((tool) => scopeToOrganization(tool, organizationId)),
    );
  }
  return tools;
}

/**
 * A server instance bound to one caller.
 *
 * Built per request: the transport is stateless, and binding the caller at
 * construction keeps it out of the tool arguments, where the model could
 * otherwise name a different user, or organization, than the one the token
 * authenticated.
 */
export function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({ name: "verifywise", version: "0.1.0" });

  for (const tool of toolsFor(caller)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, any>) => {
        try {
          return await tool.handler(args ?? {}, caller);
        } catch (error) {
          // Returned rather than thrown: the model needs to read the failure to
          // correct the call (unknown id, duplicate email, wrong role name).
          return {
            content: [{ type: "text" as const, text: (error as Error).message }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
