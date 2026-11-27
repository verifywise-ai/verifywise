import { apiServices } from "../../infrastructure/api/networkServices";

const BASE = "/v1/oauth";

/** What the consent page shows about a sign-in request from an MCP client. */
export interface McpAuthorizationRequest {
  clientName: string | null;
  /** Where the browser goes once the user answers: the client's own address. */
  redirectHost: string;
  /** The organization the connection will act in; null for a super admin without one. */
  organizationName: string | null;
  /** Whether this user may allow it (Admins and super admins). */
  canAllow: boolean;
}

/** An MCP client the signed-in user has allowed. */
export interface McpConnection {
  id: number;
  client_name: string | null;
  organization_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function getMcpAuthorizationRequest(
  request: string,
): Promise<McpAuthorizationRequest> {
  const response = await apiServices.get(`${BASE}/authorization-requests`, {
    request,
    // The consent page shows why a request cannot be used.
    suppressGlobalErrorToast: true,
  });
  return (response.data as { data: McpAuthorizationRequest }).data;
}

/** Records the user's answer; returns where to send the browser (the client's redirect URI). */
export async function decideMcpAuthorizationRequest(
  request: string,
  allow: boolean,
): Promise<string> {
  const response = await apiServices.post(
    `${BASE}/authorization-requests/decision`,
    { request, allow },
    { suppressGlobalErrorToast: true },
  );
  return (response.data as { data: { redirectUrl: string } }).data.redirectUrl;
}

export async function getMcpConnections(): Promise<McpConnection[]> {
  const response = await apiServices.get(`${BASE}/connections`);
  return (response.data as { data: McpConnection[] }).data;
}

export async function revokeMcpConnection(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/connections/${id}`);
}
