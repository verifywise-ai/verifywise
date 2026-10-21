/**
 * Shared tool shape for the hosted MCP server.
 *
 * A tool is one object; mcp/server.ts registers whatever the tools/ modules
 * export, so adding a tool means adding an object, not wiring.
 *
 * Unlike the stdio server this replaces, no tool takes a deployment argument:
 * the deployment is whichever one served the request, and the acting user comes
 * from the bearer token that authenticated it.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

/** The authenticated caller, resolved by authenticateJWT before the tool runs. */
export interface McpCaller {
  userId: number;
  organizationId: number | null;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, any>, caller: McpCaller) => Promise<CallToolResult>;
}

export function result(payload: unknown): CallToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
