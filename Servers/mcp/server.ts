/**
 * The deployment's own MCP server.
 *
 * Exposes super-admin administration — organizations, users, and the
 * governance data inside them — over Streamable HTTP at /api/mcp, so an MCP
 * client connects to the deployment directly:
 *
 *   claude mcp add --transport http verifywise \
 *     https://<deployment>/api/mcp --header "Authorization: Bearer <api token>"
 *
 * Nothing is installed anywhere. Auth is the deployment's existing API token,
 * checked by authenticateJWT + superAdminOnly before a tool ever runs, so the
 * token never reaches the model and no credential is stored on disk.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { organizationTools } from "./tools/organizations";
import { userTools } from "./tools/users";
import { useCaseTools } from "./tools/useCases";
import { riskTools } from "./tools/risks";
import { complianceTools } from "./tools/compliance";
import type { McpCaller, ToolDef } from "./tool";

const tools: ToolDef[] = [
  ...organizationTools,
  ...userTools,
  ...useCaseTools,
  ...riskTools,
  ...complianceTools,
];

/**
 * A server instance bound to one caller.
 *
 * Built per request: the transport is stateless, and binding the caller at
 * construction keeps it out of the tool arguments, where the model could
 * otherwise name a different user than the one the token authenticated.
 */
export function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({ name: "verifywise", version: "0.1.0" });

  for (const tool of tools) {
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
