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
import {
  BRAVE_API_BASE,
  BRAVE_INVALID_TOKEN_CODE,
  braveErrorCodeOf,
  readCappedBody,
} from "../webResearch/braveSearch";

export { BRAVE_API_BASE };
export const BRAVE_KEY_CHECK_TIMEOUT_MS = 8000;
/** An answer larger than this is not read. */
export const MAX_BODY_BYTES = 1024 * 1024;
export const MIN_BRAVE_KEY_LENGTH = 10;
export const MAX_BRAVE_KEY_LENGTH = 200;

const CHECK_URL = `${BRAVE_API_BASE}/web/search?q=test&count=1`;

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

  // A larger answer, or one that cannot be read, is read as "".
  const body = (await readCappedBody(response, MAX_BODY_BYTES).catch(() => "")) ?? "";
  if (braveErrorCodeOf(body) === BRAVE_INVALID_TOKEN_CODE) return invalidKey;
  if (response.status === 401 || response.status === 403) return invalidKey;
  // A key that is rate limited is a key Brave knows.
  if (response.status === 429) return { ok: true };
  if (response.status >= 200 && response.status < 300) return { ok: true };
  logger.debug(`Brave key check answered HTTP ${response.status}`);
  return unreachable;
};
