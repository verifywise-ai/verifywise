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

/** Reason given for an error that is neither a network failure nor one the caller described. */
export const UNEXPECTED_ERROR_REASON = "unexpected error (details in the server log)";

/**
 * An error a caller throws to describe a remote answer (e.g. "Failed to fetch
 * runs: HTTP 403"). Its message is shown as is; any other error that is not a
 * fetch failure is shown as UNEXPECTED_ERROR_REASON.
 */
export class RemoteStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteStatusError";
  }
}

type FetchErrorKind = "timeout" | "policy" | "network" | "invalid-json" | "remote" | "other";

type FetchErrorShape = {
  name?: string;
  message?: string;
  code?: string;
  cause?: { code?: string; message?: string };
};

/** Socket, DNS and TLS error codes from Node and undici. */
const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EHOSTDOWN",
  "ENETDOWN",
  "EPIPE",
  "EPROTO",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function isNetworkCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  return (
    NETWORK_ERROR_CODES.has(code) ||
    code.startsWith("UND_ERR_") ||
    code.startsWith("ERR_TLS_") ||
    code.startsWith("ERR_SSL_")
  );
}

function classifyFetchError(err: unknown): FetchErrorKind {
  const e = err as FetchErrorShape;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  // Checked by name: a test may mock safeOutboundUrl, and errors from
  // another realm fail `instanceof`.
  if (e?.name === "UnsafeOutboundUrlError") return "policy";
  if (e?.name === "RemoteStatusError") return "remote";
  if (e?.name === "SyntaxError") return "invalid-json";
  // undici reports every connect, DNS and TLS failure as
  // `TypeError: fetch failed` (the reason on `cause`, sometimes without a
  // code), and a body cut off mid-read as `TypeError: terminated` with an
  // UND_ERR_* cause. Any other TypeError is a bug in the caller's code.
  if (e?.name === "TypeError" && e?.message === "fetch failed") return "network";
  if (isNetworkCode(e?.code) || isNetworkCode(e?.cause?.code)) return "network";
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
 *  - a `RemoteStatusError` the caller threw keeps its message;
 *  - anything else (a bug, a database error) is UNEXPECTED_ERROR_REASON, with
 *    the real message in the server log.
 */
export function describeFetchError(err: unknown, timeoutSeconds: number): string {
  const e = err as FetchErrorShape;
  switch (classifyFetchError(err)) {
    case "timeout":
      return `request timed out (limit ${timeoutSeconds}s per request, ${EXTERNAL_SYNC_DEADLINE_MS / 1000}s per sync)`;
    case "network": {
      const detail = e?.cause?.code ?? e?.code ?? e?.cause?.message ?? e?.message ?? "unknown";
      logger.warn(`Outbound request to a configured server failed: ${detail}`);
      return CONNECTION_FAILED_REASON;
    }
    case "invalid-json":
      return "the answer was not valid JSON";
    case "policy":
    case "remote":
      return e?.message ?? String(err);
    default:
      logger.error(`Outbound request handling failed unexpectedly: ${e?.message ?? String(err)}`);
      return UNEXPECTED_ERROR_REASON;
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

/** Most characters of an error reply written to the server log. */
export const ERROR_REPLY_LOG_MAX_CHARS = 500;

/** Most bytes read from an error reply: enough to get past an HTML page's head. */
const ERROR_REPLY_READ_MAX_BYTES = 16_384;

/** How long reading an error reply may take before the error is thrown anyway. */
export const ERROR_REPLY_READ_MAX_MS = 2_000;

/**
 * An error reply as one safe log line: HTML head, script and style dropped,
 * tags removed, credentials that look like an Authorization value and the given
 * secrets replaced, control characters (newlines included) turned into spaces
 * so the remote server cannot write lines of its own, cut to
 * ERROR_REPLY_LOG_MAX_CHARS.
 */
export function errorReplyForLog(reply: string, secrets: string[] = []): string {
  let text = reply
    .replace(/<(head|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]{0,2000}>/g, " ");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  text = text
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._~-]+/gi, "$1 [redacted]")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, ERROR_REPLY_LOG_MAX_CHARS) || "no details";
}

/**
 * Write the start of a failed answer's body to the server log, then release
 * the rest. The base URL is admin-supplied, so the body is never put in an
 * error the user sees; the log keeps the reason for whoever fixes the
 * connection. Reads at most ERROR_REPLY_READ_MAX_BYTES for at most
 * ERROR_REPLY_READ_MAX_MS, so a stalled body never holds up the error, and
 * never throws. `path` is logged without its query; `secrets` (e.g. the
 * encoded credentials) are replaced if the reply echoes them.
 */
export async function logErrorReply(
  service: string,
  path: string,
  response: Response,
  secrets: string[] = [],
): Promise<void> {
  let reply = "";
  try {
    const reader =
      typeof response.body?.getReader === "function" ? response.body.getReader() : undefined;
    if (!reader) {
      await response.body?.cancel().catch(() => undefined);
    } else {
      const decoder = new TextDecoder();
      let timer: NodeJS.Timeout | undefined;
      const stop = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ERROR_REPLY_READ_MAX_MS);
      });
      try {
        let read = 0;
        while (read < ERROR_REPLY_READ_MAX_BYTES) {
          const chunk = await Promise.race([reader.read(), stop]);
          if (chunk === "timeout" || chunk.done || !chunk.value) break;
          read += chunk.value.byteLength;
          reply += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        clearTimeout(timer);
        void reader.cancel().catch(() => undefined);
      }
    }
  } catch {
    // The status alone is still logged.
  }
  logger.warn(
    `${service} returned HTTP ${response.status} for ${path.split("?")[0]}: ${errorReplyForLog(reply, secrets)}`,
  );
}
