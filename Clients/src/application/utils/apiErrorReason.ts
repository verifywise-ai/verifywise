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
