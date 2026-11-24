/**
 * Checks a Brave Search API key before it is stored, so a key that cannot work is refused on the
 * settings form instead of failing on the first vendor research run.
 *
 * A run asks two endpoints (see webResearch/braveSearch.ts): LLM Context (`/llm/context`) for the
 * web and `/news/search` for the news. A plan can hold one and not the other, so the check asks
 * both, at the same time and for one result each, with the addresses `braveUrlOf` builds for a run.
 * A plan without LLM Context (a 400 with `error.code` OPTION_NOT_IN_PLAN) is searched on web search
 * by a run, so that answer is followed by a check of web search, whose verdict stands for the web.
 * Each request goes through `safeFetch` with an 8 second limit and reads at most MAX_BODY_BYTES.
 *
 * How one answer is read: Brave refuses a wrong key with `error.code === "SUBSCRIPTION_TOKEN_INVALID"`
 * (a 422, sometimes a 401 or 403), and a plan that does not pay for the endpoint with a 402; each of
 * these is a refusal. A 2xx is a pass, and so is a 429: the key works and is only over its rate.
 * Anything else (a network error, a timeout, a 5xx, another 422) is "could not check".
 *
 * The key is valid only when both endpoints pass, invalid when either refuses it, and otherwise
 * "could not check", which the caller may still save.
 *
 * The key is never logged, and neither is the answer: only the status or the error's name.
 */
import { safeFetch } from "../../utils/safeOutboundUrl";
import logger from "../../utils/logger/fileLogger";
import {
  BRAVE_API_BASE,
  BRAVE_INVALID_TOKEN_CODE,
  BRAVE_NOT_IN_PLAN_CODE,
  braveEndpointUrlOf,
  braveErrorCodeOf,
  braveUrlOf,
  readCappedBody,
} from "../webResearch/braveSearch";
import type { SearchKind } from "../webResearch/webSearch";

export { BRAVE_API_BASE };
export const BRAVE_KEY_CHECK_TIMEOUT_MS = 8000;
/** An answer larger than this is not read. */
export const MAX_BODY_BYTES = 1024 * 1024;
export const MIN_BRAVE_KEY_LENGTH = 10;
export const MAX_BRAVE_KEY_LENGTH = 200;

/** The endpoints a run asks, each checked with the address of a one-result search. */
const CHECKED_KINDS: readonly SearchKind[] = ["web", "news"];
export const BRAVE_KEY_CHECK_URLS: readonly string[] = CHECKED_KINDS.map((kind) =>
  braveUrlOf("test", kind, 1),
);
/** The web search address, asked when the plan has no LLM Context. */
export const BRAVE_WEB_SEARCH_CHECK_URL = braveEndpointUrlOf("test", "webSearch", 1);

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

/** What one endpoint said of the key. */
type EndpointVerdict = "pass" | "refused" | "unreachable" | "not_in_plan";

/** Asks one endpoint with the key and reads its answer. */
const checkEndpoint = async (
  url: string,
  key: string,
  fetchImpl: NonNullable<BraveKeyCheckDeps["fetchImpl"]>,
  timeoutMs: number,
): Promise<EndpointVerdict> => {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Network error, DNS, timeout or the outbound policy: only the name, never the message.
    logger.debug(`Brave key check request failed: ${(error as Error)?.name ?? "error"}`);
    return "unreachable";
  }

  // A larger answer, or one that cannot be read, is read as "".
  const body = (await readCappedBody(response, MAX_BODY_BYTES).catch(() => "")) ?? "";
  const errorCode = braveErrorCodeOf(body);
  if (errorCode === BRAVE_INVALID_TOKEN_CODE) return "refused";
  if (response.status === 400 && errorCode === BRAVE_NOT_IN_PLAN_CODE) return "not_in_plan";
  if (response.status === 401 || response.status === 402 || response.status === 403) {
    return "refused";
  }
  // A key that is rate limited is a key Brave knows.
  if (response.status === 429) return "pass";
  if (response.status >= 200 && response.status < 300) return "pass";
  logger.debug(`Brave key check answered HTTP ${response.status}`);
  return "unreachable";
};

export const checkBraveKey = async (
  key: string,
  deps: BraveKeyCheckDeps = {},
): Promise<BraveKeyCheckResult> => {
  if (!isPlausibleBraveKey(key)) return { ok: false, code: "invalid_key" };
  const fetchImpl = deps.fetchImpl ?? safeFetch;
  const timeoutMs = deps.timeoutMs ?? BRAVE_KEY_CHECK_TIMEOUT_MS;

  const verdicts = await Promise.all(
    BRAVE_KEY_CHECK_URLS.map(async (url) => {
      const verdict = await checkEndpoint(url, key, fetchImpl, timeoutMs);
      // A plan without LLM Context: a run searches the web on web search, so that is checked.
      if (verdict === "not_in_plan" && url === BRAVE_KEY_CHECK_URLS[0]) {
        return checkEndpoint(BRAVE_WEB_SEARCH_CHECK_URL, key, fetchImpl, timeoutMs);
      }
      return verdict;
    }),
  );
  // An endpoint the plan does not hold, with no other to ask, cannot be searched: a refusal.
  if (verdicts.includes("not_in_plan")) return { ok: false, code: "invalid_key" };
  if (verdicts.includes("refused")) return { ok: false, code: "invalid_key" };
  if (verdicts.every((verdict) => verdict === "pass")) return { ok: true };
  return { ok: false, code: "unreachable" };
};
