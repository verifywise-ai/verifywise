/**
 * The specific reason carried in an API error response, if there is one.
 *
 * `apiServices` throws a CustomException whose `response` is the response
 * body. Server envelopes put the reason in `data` for 4xx responses and in
 * `error` for 5xx responses; `message` is only the generic status text
 * ("Bad Request", "Bad Gateway"), so it is not a reason.
 */
export function getApiErrorReason(error: unknown): string | null {
  const body = (error as { response?: { error?: unknown; data?: unknown } } | null)?.response;
  if (typeof body?.error === "string" && body.error) return body.error;
  if (typeof body?.data === "string" && body.data) return body.data;
  return null;
}

/**
 * The server's reason for a rejected request (4xx), safe to show the user.
 * Returns null for anything else: a 5xx reason can carry internal details,
 * so it is never surfaced.
 */
export function getClientErrorReason(error: unknown): string | null {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number" || status < 400 || status >= 500) return null;
  const body = (error as { response?: { data?: unknown } }).response;
  return typeof body?.data === "string" && body.data ? body.data : null;
}
