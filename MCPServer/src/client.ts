/**
 * HTTP client for the VerifyWise API.
 *
 * Every request carries the profile's API token as a Bearer credential, which
 * Servers/middleware/auth.middleware.ts validates against the api_tokens table
 * on each call. All the super-admin routes additionally require the token's
 * user to be in super_admins.
 *
 * Responses are wrapped by Servers/utils/statusCode.utils.ts as
 * `{ message, data }`; this unwraps them and turns failures into messages a
 * person can act on rather than a dumped response body.
 */

import { deploymentLabel, type Profile } from "./config.js";

const REQUEST_TIMEOUT_MS = 30_000;

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

/**
 * Pull the most specific message out of an error body. The API returns either
 * `{ message, data: "..." }` or `{ message, data: { message, field } }`
 * depending on the handler.
 */
function extractDetail(body: unknown): string | undefined {
  if (typeof body === "string") return body.trim() || undefined;
  if (!body || typeof body !== "object") return undefined;

  const envelope = body as { message?: unknown; data?: unknown };
  const inner = envelope.data;

  if (typeof inner === "string" && inner.trim()) return inner.trim();
  if (inner && typeof inner === "object") {
    const { message, field } = inner as { message?: unknown; field?: unknown };
    if (typeof message === "string" && message.trim()) {
      return typeof field === "string" && field ? `${message} (field: ${field})` : message.trim();
    }
  }
  if (typeof envelope.message === "string" && envelope.message.trim()) {
    return envelope.message.trim();
  }
  return undefined;
}

function describeFailure(status: number, detail: string | undefined, profile: Profile): string {
  const where = deploymentLabel(profile);
  switch (status) {
    case 401:
      return `Authentication failed on ${where}: the API token is invalid, expired, or has been revoked.`;
    case 403:
      return (
        `${detail ?? "Forbidden"} — on ${where}. Super-admin routes require the token's user to be ` +
        `an Admin of an organization AND listed in super_admins.`
      );
    case 404:
      return `Not found on ${where}: ${detail ?? "the requested record does not exist"}.`;
    case 409:
      return `Conflict on ${where}: ${detail ?? "the record already exists"}.`;
    case 429:
      return `Rate limited by ${where}. Retry in a minute.`;
    default:
      return `${where} returned ${status}: ${detail ?? "no further detail"}.`;
  }
}

export async function request<T = unknown>(
  profile: Profile,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const url = `${profile.url}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${profile.token}`,
        Accept: "application/json",
        // Some deployments front the API with an nginx referer check
        // (valid_referers without `none`), which 403s any request that
        // arrives without a Referer matching the site — every non-browser
        // client included. Derived from the profile's own url so it is
        // correct per deployment.
        Referer: `${new URL(profile.url).origin}/`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach ${profile.name} at ${url}: ${reason}`);
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new Error(describeFailure(response.status, extractDetail(parsed), profile));
  }

  // Most endpoints wrap their payload as { message, data }, but not all: a
  // successful invite returns a bare { message } (vwmailer.ctrl.ts:81). Unwrap
  // when the envelope is there, otherwise take the body as it came.
  const data =
    parsed && typeof parsed === "object" && "data" in parsed
      ? (parsed as { data: T }).data
      : (parsed as T);

  return { status: response.status, data };
}
