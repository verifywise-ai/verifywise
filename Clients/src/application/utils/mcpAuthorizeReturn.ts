/**
 * Brings a user back to the MCP consent page after logging in.
 *
 * An MCP client opens /mcp/authorize in the browser; a user who is not signed
 * in is sent to the login page first, and every way of logging in lands on a
 * fixed page. The consent page remembers itself here, and the login flows ask
 * for it before choosing where to land.
 */
const KEY = "mcp_authorize_return";
const CONSENT_PATH = "/mcp/authorize?";

export function rememberMcpAuthorization(path: string): void {
  sessionStorage.setItem(KEY, path);
}

/** The consent page to return to, once; null when there is none. */
export function takeMcpAuthorizationReturn(): string | null {
  const path = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return path?.startsWith(CONSENT_PATH) ? path : null;
}
