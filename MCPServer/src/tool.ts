/**
 * Shared tool shape. A tool is one object; index.ts registers whatever the
 * tools/ modules export, so adding a tool means adding an object, not wiring.
 */

import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, any>) => Promise<CallToolResult>;
}

/** Every tool names the deployment it acts on. Always required — there is no fallback. */
export const profileArg = z
  .string()
  .describe("Name of the VerifyWise deployment profile to act on, as defined in the profile file.");

export function result(payload: unknown): CallToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
