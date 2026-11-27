import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getMcpTools } from "../repository/mcp.repository";

/**
 * The MCP tools the signed-in user gets. Keyed by who is signed in, since the
 * server's answer depends on the user, their organization and whether they
 * are a super admin. `enabled` is false where the user may not be allowed to
 * ask (the server answers 403).
 */
export function useMcpTools(enabled = true) {
  const { userId, organizationId, isSuperAdmin } = useAuth();
  return useQuery({
    queryKey: ["mcp-tools", userId, organizationId, isSuperAdmin],
    queryFn: getMcpTools,
    enabled: enabled && userId !== null,
  });
}
