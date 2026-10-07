/**
 * Helpers for extensions that call a customer-configured external service
 * (MLflow, Azure AI Foundry) from a browser-initiated request.
 */

/**
 * Overall limit for one sync or connection test. It stays below the client's
 * 120s axios timeout (Clients/src/infrastructure/api/customAxios.ts) so the
 * user always gets the server's reason instead of a generic client timeout.
 */
export const EXTERNAL_SYNC_DEADLINE_MS = 110_000;

/** Abort signal for one request: its own timeout or the shared deadline, whichever is first. */
export function requestSignal(timeoutSeconds: number, deadline: AbortSignal): AbortSignal {
  return AbortSignal.any([AbortSignal.timeout(timeoutSeconds * 1000), deadline]);
}

/**
 * Turn a fetch failure into a reason a user can act on. Node's fetch reports
 * connection, DNS and TLS failures as a bare "fetch failed" with the real
 * cause (ECONNREFUSED, SELF_SIGNED_CERT_IN_CHAIN, ...) on `err.cause`.
 */
export function describeFetchError(err: unknown, timeoutSeconds: number): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return `request timed out (limit ${timeoutSeconds}s per request, ${EXTERNAL_SYNC_DEADLINE_MS / 1000}s per sync)`;
  }
  const message = e?.message ?? String(err);
  const detail = e?.cause?.code ?? e?.cause?.message;
  return detail && !message.includes(detail) ? `${message} (${detail})` : message;
}
