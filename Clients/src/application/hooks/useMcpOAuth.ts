import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMcpAuthorizationRequest,
  getMcpConnections,
  revokeMcpConnection,
} from "../repository/mcpOAuth.repository";

/** The sign-in request a consent page was opened with. Not retried: an invalid request stays invalid. */
export function useMcpAuthorizationRequest(request: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["mcp-authorization-request", request],
    queryFn: () => getMcpAuthorizationRequest(request!),
    enabled: enabled && request !== null,
    retry: false,
  });
}

/** The MCP clients the signed-in user has allowed. */
export function useMcpConnections() {
  return useQuery({ queryKey: ["mcp-connections"], queryFn: getMcpConnections });
}

export function useRevokeMcpConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeMcpConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-connections"] }),
  });
}
