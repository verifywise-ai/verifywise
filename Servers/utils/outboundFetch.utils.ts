/**
 * Helpers for extensions that call a customer-configured external service
 * (MLflow, Azure AI Foundry, Jira) from a browser-initiated request.
 */

import logger from "./logger/fileLogger";

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

/** Reason given for every connect, DNS and TLS failure. */
export const CONNECTION_FAILED_REASON = "connection failed";

/** The whole message a connection test shows for those failures. */
export const UNREACHABLE_MESSAGE = "Could not reach the server";

type FetchErrorKind = "timeout" | "policy" | "network" | "invalid-json" | "other";

type FetchErrorShape = {
  name?: string;
  message?: string;
  cause?: { code?: string; message?: string };
};

function classifyFetchError(err: unknown): FetchErrorKind {
  const e = err as FetchErrorShape;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  // Checked by name: a test may mock safeOutboundUrl, and errors from
  // another realm fail `instanceof`.
  if (e?.name === "UnsafeOutboundUrlError") return "policy";
  if (e?.name === "SyntaxError") return "invalid-json";
  // fetch reports connect, DNS and TLS failures (and a body cut off
  // mid-read) as a TypeError with the real reason on `cause`.
  if (e?.name === "TypeError" || e?.cause !== undefined) return "network";
  return "other";
}

/**
 * Turn a fetch failure into a reason a user can act on, without telling a
 * caller anything about the network behind the server:
 *  - a timeout names the limits;
 *  - a refused address or redirect (`UnsafeOutboundUrlError`) keeps its message;
 *  - every connect, DNS and TLS failure is the same "connection failed", so
 *    the text cannot be used to tell open ports from closed ones or which
 *    names resolve; the detail goes to the server log only;
 *  - a body that is not JSON says so without quoting it (the parser's own
 *    message quotes the start of the body);
 *  - anything else (errors the caller threw itself) keeps its message.
 */
export function describeFetchError(err: unknown, timeoutSeconds: number): string {
  const e = err as FetchErrorShape;
  switch (classifyFetchError(err)) {
    case "timeout":
      return `request timed out (limit ${timeoutSeconds}s per request, ${EXTERNAL_SYNC_DEADLINE_MS / 1000}s per sync)`;
    case "network": {
      const detail = e?.cause?.code ?? e?.cause?.message ?? e?.message ?? "unknown";
      logger.warn(`Outbound request to a configured server failed: ${detail}`);
      return CONNECTION_FAILED_REASON;
    }
    case "invalid-json":
      return "the answer was not valid JSON";
    default:
      return e?.message ?? String(err);
  }
}

/**
 * The message a connection test shows when its request throws: a refused
 * address or redirect as is, a network failure as "Could not reach the
 * server", anything else as "Connection failed: <reason>".
 */
export function describeConnectionTestError(err: unknown, timeoutSeconds: number): string {
  const kind = classifyFetchError(err);
  if (kind === "policy") return (err as Error).message;
  const reason = describeFetchError(err, timeoutSeconds);
  if (kind === "network") return UNREACHABLE_MESSAGE;
  return `Connection failed: ${reason}`;
}
