import CustomException from "../../infrastructure/exceptions/customeException";

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
 * The AI Gateway's reason for a failed request. The gateway (FastAPI) reports
 * errors as { detail }: a string, { message, code }, or for a request that
 * fails validation (422) a list of { msg }. The envelope readers above do not
 * look at it; `apiServices` passes that body through as the error's
 * `response`. Only for a rejected request (4xx), and not a 401: the gateway
 * answers 401 when the backend's internal key is wrong, a deployment
 * misconfiguration the user cannot act on. A 5xx detail can carry internal
 * details, so it is never surfaced either.
 */
export function getGatewayErrorDetail(error: unknown): string | null {
  if (!isClientError(error) || error.status === 401) return null;
  const detail = (error as { response?: { detail?: unknown } } | null)?.response?.detail;
  if (typeof detail === "string") return detail || null;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (entry as { msg?: unknown } | null)?.msg)
      .filter((msg): msg is string => typeof msg === "string" && msg.trim() !== "")
      // Pydantic prefixes a validator's own message with "Value error, ".
      .map((msg) => msg.replace(/^Value error, /, "").trim());
    return messages.length > 0 ? [...new Set(messages)].join(" ") : null;
  }
  const message = (detail as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : null;
}

/**
 * The text to show for a failed AI Gateway request: the gateway's own
 * { detail } reason, else the server's reason for a rejected request (4xx;
 * generic status text is filtered out), else `fallback`. 5xx reasons are never
 * shown.
 */
export function getGatewayErrorText(error: unknown, fallback: string): string {
  // A 401 is the internal-key misconfiguration above, whatever its message.
  if (isClientError(error) && error.status === 401) return fallback;
  return getGatewayErrorDetail(error) || getClientErrorReason(error) || fallback;
}

/** The standard 4xx status phrases: a message that is only one of these says nothing. */
const CLIENT_ERROR_PHRASES = new Set([
  "Bad Request",
  "Unauthorized",
  "Payment Required",
  "Forbidden",
  "Not Found",
  "Method Not Allowed",
  "Not Acceptable",
  "Proxy Authentication Required",
  "Request Timeout",
  "Conflict",
  "Gone",
  "Length Required",
  "Precondition Failed",
  "Payload Too Large",
  "Content Too Large",
  "URI Too Long",
  "Unsupported Media Type",
  "Range Not Satisfiable",
  "Expectation Failed",
  "Misdirected Request",
  "Unprocessable Entity",
  "Unprocessable Content",
  "Locked",
  "Failed Dependency",
  "Too Early",
  "Upgrade Required",
  "Precondition Required",
  "Too Many Requests",
  "Request Header Fields Too Large",
  "Unavailable For Legal Reasons",
]);

/** axios' own message when a response has no body to take a reason from. */
const AXIOS_STATUS_MESSAGE = /^Request failed with status code \d+$/;

/** An API error (as apiServices throws it) for a rejected request (4xx). */
export function isClientError(error: unknown): error is CustomException {
  return (
    error instanceof CustomException &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

/**
 * The server's reason for a rejected request (4xx), safe to show the user.
 * networkServices.handleError has already taken the reason out of the
 * response envelope into `message`. Returns null when that is only the
 * generic status text, and for anything but a 4xx: a 5xx reason can carry
 * internal details, so it is never surfaced.
 */
export function getClientErrorReason(error: unknown): string | null {
  if (!isClientError(error)) return null;
  const message = error.message.trim();
  if (!message || CLIENT_ERROR_PHRASES.has(message) || AXIOS_STATUS_MESSAGE.test(message)) {
    return null;
  }
  return message;
}

/** Which field errors of a validation response may be shown to the user, and how. */
export interface UserFacingFieldErrors {
  /** Fields whose server message is already user-facing; shown as sent. */
  passThrough?: readonly string[];
  /**
   * Fields whose server message names internals (column names, ids); shown
   * as this text instead.
   */
  replace?: Readonly<Record<string, string>>;
}

/**
 * The message to show for a rejected (4xx) request.
 *
 * For a validation response (`{ data: { errors: [{ field, message, code }] } }`)
 * only the fields listed in `fields` are surfaced: `passThrough` fields with
 * the server's message, `replace` fields with the given text. Other field
 * errors are skipped; if none are left, returns null so the caller shows its
 * own generic text. Without field errors, falls back to the general 4xx reason
 * (getClientErrorReason). Returns null for 5xx and non-API errors.
 */
export function getApiValidationMessage(
  error: unknown,
  fields: UserFacingFieldErrors,
): string | null {
  if (!isClientError(error)) return null;
  const body = error.response as { data?: { errors?: unknown }; errors?: unknown } | undefined;
  const errors = body?.data?.errors ?? body?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages: string[] = [];
    for (const entry of errors as Array<{ field?: unknown; message?: unknown } | null>) {
      const field = typeof entry?.field === "string" ? entry.field : "";
      const replacement = fields.replace?.[field];
      if (replacement) {
        messages.push(replacement);
      } else if (
        fields.passThrough?.includes(field) &&
        typeof entry?.message === "string" &&
        entry.message.trim()
      ) {
        messages.push(entry.message.trim());
      }
    }
    const unique = [...new Set(messages)];
    return unique.length > 0 ? unique.join(" ") : null;
  }
  return getClientErrorReason(error);
}
