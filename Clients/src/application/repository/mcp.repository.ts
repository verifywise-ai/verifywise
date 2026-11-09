import { apiServices } from "../../infrastructure/api/networkServices";

/** A tool the deployment's MCP server offers. */
export interface McpTool {
  name: string;
  title?: string;
  description?: string;
}

interface ToolsListResponse {
  result?: { tools: McpTool[] };
}

/**
 * The tools /api/mcp offers the signed-in user.
 *
 * Asked of the MCP server itself, which decides them from the caller
 * (Servers/mcp/server.ts), so the list shown always matches what a connection
 * made with this user's token gets. The MCP transport answers 406 unless
 * Accept lists both content types.
 */
export async function getMcpTools(): Promise<McpTool[]> {
  const response = await apiServices.post<ToolsListResponse>(
    "/mcp",
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { routeUrl: "/mcp", headers: { Accept: "application/json, text/event-stream" } },
  );
  return response.data.result?.tools ?? [];
}
