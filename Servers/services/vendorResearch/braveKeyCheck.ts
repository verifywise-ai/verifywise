/**
 * Checks a Brave Search API key before it is stored, so a key that cannot work is refused on the
 * settings form instead of failing on the first vendor research run.
 *
 * One request per check, the cheapest the plan offers: `GET /web/search?q=test&count=1`, sent
 * through `safeFetch` with an 8 second limit, reading at most MAX_BODY_BYTES of the answer. Brave
 * refuses a wrong key with `error.code === "SUBSCRIPTION_TOKEN_INVALID"` (a 422, sometimes a 401 or
 * 403). A 429 means the key works and is only over its rate, so it counts as valid. A network
 * error, a timeout or a 5xx is "could not check", which the caller may still save.
 *
 * The key is never logged, and neither is the answer: only the status or the error's name.
 */
import { safeFetch } from "../../utils/safeOutboundUrl";
import logger from "../../utils/logger/fileLogger";

export const BRAVE_API_BASE = "https://api.search.brave.com/res/v1";
export const BRAVE_KEY_CHECK_TIMEOUT_MS = 8000;
/** An answer larger than this is not read. */
export const MAX_BODY_BYTES = 1024 * 1024;
export const MIN_BRAVE_KEY_LENGTH = 10;
export const MAX_BRAVE_KEY_LENGTH = 200;

const CHECK_URL = `${BRAVE_API_BASE}/web/search?q=test&count=1`;
const INVALID_TOKEN_CODE = "SUBSCRIPTION_TOKEN_INVALID";

/**
 * Why a key was not accepted: `invalid_key` means the text cannot be a key or Brave refused it;
 * `unreachable` means the check could not be made or finished.
 */
export type BraveKeyCheckCode = "invalid_key" | "unreachable";

export type BraveKeyCheckResult = { ok: true } | { ok: false; code: BraveKeyCheckCode };

export interface BraveKeyCheckDeps {
  /** Defaults to `safeFetch`; tests pass a fake. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

/**
 * Whether the text can be a key: 10 to 200 characters, each printable ASCII other than the space
 * (no whitespace, no control characters, nothing a header cannot carry). A loop over the
 * characters, not a regular expression.
 */
export const isPlausibleBraveKey = (key: unknown): key is string => {
  if (typeof key !== "string") return false;
  if (key.length < MIN_BRAVE_KEY_LENGTH || key.length > MAX_BRAVE_KEY_LENGTH) return false;
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
};

/** Reads at most MAX_BODY_BYTES, cancelling the stream past that; a larger answer reads as "". */
const readCapped = async (response: Response): Promise<string> => {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return "";
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
};

/** The `error.code` of a Brave error answer, or null when the body is not one. */
const errorCodeOf = (body: string): string | null => {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    const code = parsed?.error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
};

const unreachable: BraveKeyCheckResult = { ok: false, code: "unreachable" };
const invalidKey: BraveKeyCheckResult = { ok: false, code: "invalid_key" };

export const checkBraveKey = async (
  key: string,
  deps: BraveKeyCheckDeps = {},
): Promise<BraveKeyCheckResult> => {
  if (!isPlausibleBraveKey(key)) return invalidKey;
  const fetchImpl = deps.fetchImpl ?? safeFetch;

  let response: Response;
  try {
    response = await fetchImpl(CHECK_URL, {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(deps.timeoutMs ?? BRAVE_KEY_CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    // Network error, DNS, timeout or the outbound policy: only the name, never the message.
    logger.debug(`Brave key check request failed: ${(error as Error)?.name ?? "error"}`);
    return unreachable;
  }

  const body = await readCapped(response).catch(() => "");
  if (errorCodeOf(body) === INVALID_TOKEN_CODE) return invalidKey;
  if (response.status === 401 || response.status === 403) return invalidKey;
  // A key that is rate limited is a key Brave knows.
  if (response.status === 429) return { ok: true };
  if (response.status >= 200 && response.status < 300) return { ok: true };
  logger.debug(`Brave key check answered HTTP ${response.status}`);
  return unreachable;
};
