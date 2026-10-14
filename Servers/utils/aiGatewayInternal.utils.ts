/**
 * Server-to-server calls to the AI Gateway's internal API.
 *
 * Same trust model as the proxy in routes/aiGateway.route.ts: the internal key
 * authenticates the backend, and the gateway trusts the organization and role
 * headers. Callers must pass the signed-in user's own organization and role
 * from the request, never values supplied by the client.
 */

import { getGatewayInternalKey, getGatewayUrl } from "./aiGatewayConfig";

const AI_GATEWAY_TIMEOUT_MS = 10_000;

/** Upstream bodies are cut to this length in error messages, so logs stay readable. */
const ERROR_BODY_MAX_CHARS = 200;

export interface AiGatewayRequestOptions {
  organizationId?: number;
  role?: string;
  userId?: number;
  body?: object;
  /** Overrides the default timeout, for long-running calls such as the retention purge. */
  timeoutMs?: number;
  /** Forwarded as x-request-id so logs thread across services. */
  requestId?: string;
}

/** A non-2xx response from the gateway; carries its status and parsed body. */
export class AiGatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

/**
 * Call an AI Gateway internal endpoint; throws an AiGatewayError on a non-2xx
 * response, or the fetch error on a timeout or network failure.
 */
export async function aiGatewayRequest(
  method: string,
  path: string,
  options: AiGatewayRequestOptions = {},
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-internal-key": getGatewayInternalKey(),
  };
  if (options.organizationId !== undefined) {
    headers["x-organization-id"] = String(options.organizationId);
  }
  if (options.role) headers["x-role"] = options.role;
  if (options.userId !== undefined) headers["x-user-id"] = String(options.userId);
  if (options.requestId) headers["x-request-id"] = options.requestId;

  const response = await fetch(`${getGatewayUrl()}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_GATEWAY_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON: keep the raw text.
    }
    const excerpt =
      text.length > ERROR_BODY_MAX_CHARS ? `${text.slice(0, ERROR_BODY_MAX_CHARS)}...` : text;
    throw new AiGatewayError(
      response.status,
      body,
      `AIGateway ${path} returned ${response.status}: ${excerpt}`,
    );
  }
  return response.json();
}
