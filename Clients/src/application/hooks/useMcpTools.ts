import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getMcpTools } from "../repository/mcp.repository";

/**
 * The MCP tools the signed-in user gets. Keyed by who is signed in, since the
 * server's answer depends on the user, their organization and whether they
 * are a super admin.
 */
export function useMcpTools() {
  const { userId, organizationId, isSuperAdmin } = useAuth();
  return useQuery({
    queryKey: ["mcp-tools", userId, organizationId, isSuperAdmin],
    queryFn: getMcpTools,
    enabled: userId !== null,
  });
}
