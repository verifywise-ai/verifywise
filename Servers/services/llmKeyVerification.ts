/**
 * Checks an LLM key with its provider before it is saved, so a key that
 * cannot work is refused on the form instead of failing on first use.
 *
 * One cheap, free request per check (a model lookup or the key's own info),
 * sent with the key and its custom headers exactly as the Advisor will send
 * them (`advisor/llmModelFactory.ts`):
 *
 *   Anthropic   GET https://api.anthropic.com/v1/models/{model}
 *               (a valid key and an unknown model is a 404, so one request
 *               checks both the key and the model)
 *   OpenAI      GET https://api.openai.com/v1/models  (model looked up in the list)
 *   OpenRouter  GET https://openrouter.ai/api/v1/key  (needs auth; /models is public)
 *   Custom      GET {url}/models                      (model looked up when a list comes back)
 *
 * Every request goes through `safeFetch`: a Custom URL is admin-supplied, and
 * a URL the outbound policy refuses (loopback, metadata) counts as
 * "unreachable", which the caller can still save with skip_verification.
 * At most MAX_BODY_BYTES of an answer are read.
 *
 * The key is never logged, and neither are the custom headers.
 */
import { safeFetch } from "../utils/safeOutboundUrl";
import logger from "../utils/logger/fileLogger";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";

export const LLM_KEY_VERIFY_TIMEOUT_MS = 8000;
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_WORKSPACE_HEADER = "anthropic-workspace-id";
/** A model list larger than this is not read. */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Why a key was not accepted. `workspace_required`, `invalid_key` and
 * `model_unavailable` mean the provider answered and refused; `unreachable`
 * means the check could not be made or finished (network error, timeout,
 * 5xx, rate limit, refused URL, a key that may not list models, a Custom
 * model the endpoint does not list), so the key can still be saved.
 */
export type LLMKeyVerificationCode =
  "workspace_required" | "invalid_key" | "model_unavailable" | "unreachable";

/**
 * A more specific cause, for the message:
 * - `bad_characters` (invalid_key): the key has characters no key can have.
 * - `cannot_list_models` (unreachable): the key may not list models.
 * - `model_not_listed` (unreachable): a Custom endpoint's list lacks the model.
 */
export type LLMKeyVerificationReason = "bad_characters" | "cannot_list_models" | "model_not_listed";

export type LLMKeyVerificationResult =
  { ok: true } | { ok: false; code: LLMKeyVerificationCode; reason?: LLMKeyVerificationReason };

export interface LLMKeyToVerify {
  name: LLMProvider;
  key: string;
  model: string;
  url?: string | null;
  custom_headers?: Record<string, string> | null;
}

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Keys are printable ASCII; anything else (curly quotes, line breaks) cannot go in a header. */
const HAS_NON_KEY_CHARACTERS = /[^\x21-\x7E]/;

/**
 * The provider's auth headers first, then the key's custom headers, which win
 * (as in the SDKs). Throws when an auth header cannot be set.
 */
const buildHeaders = (
  auth: Record<string, string>,
  custom: Record<string, string> | null | undefined,
): Headers => {
  const headers = new Headers({ accept: "application/json" });
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  for (const [k, v] of Object.entries(custom ?? {})) {
    try {
      headers.set(k, v);
    } catch {
      // An invalid header name or value is left out of the check; the
      // request would fail the same way on use, which is not the key's fault.
    }
  }
  return headers;
};

interface ProviderResponse {
  status: number;
  body: string;
  /** The answer was larger than MAX_BODY_BYTES; `body` is empty. */
  tooLarge: boolean;
}

/** Reads at most MAX_BODY_BYTES, cancelling the stream past that. */
const readCapped = async (response: Response): Promise<{ body: string; tooLarge: boolean }> => {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return { body: "", tooLarge: true };
  }
  const reader = response.body?.getReader();
  if (!reader) return { body: "", tooLarge: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { body: "", tooLarge: true };
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks).toString("utf8"), tooLarge: false };
};

const request = async (url: string, headers: Headers): Promise<ProviderResponse | null> => {
  try {
    const response = await safeFetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(LLM_KEY_VERIFY_TIMEOUT_MS),
    });
    const { body, tooLarge } = await readCapped(response).catch(() => ({
      body: "",
      tooLarge: false,
    }));
    return { status: response.status, body, tooLarge };
  } catch (error) {
    // Network error, DNS, timeout or a URL the outbound policy refuses.
    logger.debug(`LLM key check request failed: ${(error as Error)?.name ?? "error"}`);
    return null;
  }
};

/** Model ids in an OpenAI-style list (`{ data: [{ id }] }`), or null when the body is not one. */
const modelIdsFrom = (body: string): string[] | null => {
  try {
    const parsed = JSON.parse(body) as { data?: unknown };
    if (!Array.isArray(parsed?.data)) return null;
    const ids = parsed.data
      .map((m) => (m && typeof m === "object" ? (m as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === "string");
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
};

const unreachable: LLMKeyVerificationResult = { ok: false, code: "unreachable" };
const fail = (
  code: LLMKeyVerificationCode,
  reason?: LLMKeyVerificationReason,
): LLMKeyVerificationResult => (reason ? { ok: false, code, reason } : { ok: false, code });

/** A 401/403 that says the key lacks a permission (not that the key is wrong). */
const MISSING_PERMISSION = /missing scopes?|api\.model\.read|insufficient (permissions|scopes?)/i;

/**
 * 401/403 refuse the key, unless the answer says the key only lacks the
 * permission to list models (a restricted OpenAI key): that is "could not
 * check". Other non-2xx answers (429, 5xx, ...) are not a verdict on the key.
 */
const classifyStatus = (res: ProviderResponse): LLMKeyVerificationResult | null => {
  if (res.status === 401 || res.status === 403) {
    return MISSING_PERMISSION.test(res.body)
      ? fail("unreachable", "cannot_list_models")
      : fail("invalid_key");
  }
  if (res.status < 200 || res.status >= 300) return unreachable;
  return null;
};

const verifyAnthropic = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  const headers = buildHeaders(
    { "x-api-key": input.key, "anthropic-version": ANTHROPIC_VERSION },
    input.custom_headers,
  );
  const res = await request(`${ANTHROPIC_BASE}/models/${encodeURIComponent(input.model)}`, headers);
  if (!res) return unreachable;
  // A key outside any workspace is refused with a 400 that names the header.
  if (res.status >= 400 && res.status < 500 && res.body.includes(ANTHROPIC_WORKSPACE_HEADER)) {
    return fail("workspace_required");
  }
  if (res.status === 404) return fail("model_unavailable");
  if (res.status === 401 || res.status === 403) return fail("invalid_key");
  return classifyStatus(res) ?? { ok: true };
};

const verifyOpenAI = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  const headers = buildHeaders({ authorization: `Bearer ${input.key}` }, input.custom_headers);
  const res = await request(`${OPENAI_BASE}/models`, headers);
  if (!res) return unreachable;
  const verdict = classifyStatus(res);
  if (verdict) return verdict;
  const ids = res.tooLarge ? null : modelIdsFrom(res.body);
  // Absent from the list the key sees: this key cannot use the model.
  if (ids && !ids.includes(input.model)) return fail("model_unavailable");
  return { ok: true };
};

const verifyOpenRouter = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  const headers = buildHeaders({ authorization: `Bearer ${input.key}` }, input.custom_headers);
  const res = await request(`${OPENROUTER_BASE}/key`, headers);
  if (!res) return unreachable;
  return classifyStatus(res) ?? { ok: true };
};

/** Local servers list "llama3:latest" for "llama3"; routers prefix a vendor ("openai/gpt-4o"). */
const customListHas = (ids: string[], model: string): boolean =>
  ids.some((id) => id === model || id === `${model}:latest` || id.endsWith(`/${model}`));

const verifyCustom = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  if (!input.url) return unreachable;
  const headers = buildHeaders({ authorization: `Bearer ${input.key}` }, input.custom_headers);
  const res = await request(`${input.url.replace(/\/+$/, "")}/models`, headers);
  if (!res) return unreachable;
  // Some compatible servers have no /models (404/405): that is "cannot check".
  const verdict = classifyStatus(res);
  if (verdict) return verdict;
  if (res.tooLarge) return unreachable;
  const ids = modelIdsFrom(res.body);
  // A compatible server's list is not always complete (aliases, routing), so
  // a missing model is a warning the admin can save past.
  if (ids && !customListHas(ids, input.model)) return fail("unreachable", "model_not_listed");
  return { ok: true };
};

const verifiers: Record<LLMProvider, (input: LLMKeyToVerify) => Promise<LLMKeyVerificationResult>> =
  {
    Anthropic: verifyAnthropic,
    OpenAI: verifyOpenAI,
    OpenRouter: verifyOpenRouter,
    Custom: verifyCustom,
  };

export const verifyLLMKey = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  const verify = verifiers[input.name];
  if (!verify) return unreachable;
  let result: LLMKeyVerificationResult;
  if (HAS_NON_KEY_CHARACTERS.test(input.key)) {
    result = fail("invalid_key", "bad_characters");
  } else {
    try {
      result = await verify(input);
    } catch (error) {
      // An auth header the key cannot be put in. The error is not logged: it
      // can quote the value.
      if (error instanceof TypeError) result = fail("invalid_key", "bad_characters");
      else throw error;
    }
  }
  logger.debug(
    `LLM key check for ${input.name}: ${result.ok ? "accepted" : `${result.code}${result.reason ? ` (${result.reason})` : ""}`}`,
  );
  return result;
};
