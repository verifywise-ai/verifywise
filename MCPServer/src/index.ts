#!/usr/bin/env node
/**
 * VerifyWise MCP server.
 *
 * Exposes super-admin organization and user administration over stdio. The
 * deployment to act on is named per call and resolved from the local profile
 * file, so one installation serves every deployment and no credential is ever
 * passed through the model.
 *
 * stdout carries the MCP protocol — diagnostics go to stderr only.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { organizationTools } from "./tools/organizations.js";
import { userTools } from "./tools/users.js";
import type { ToolDef } from "./tool.js";

const tools: ToolDef[] = [...organizationTools, ...userTools];

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
        return await tool.handler(args);
      } catch (error) {
        // Returned rather than thrown: the model needs to read the failure to
        // correct the call (unknown profile, duplicate email, wrong role name).
        return {
          content: [{ type: "text" as const, text: (error as Error).message }],
          isError: true,
        };
      }
    },
  );
}

await server.connect(new StdioServerTransport());
