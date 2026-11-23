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
 *
 * The key is never logged, and neither are the custom headers.
 */
import { safeFetch } from "../utils/safeOutboundUrl";
import logger from "../utils/logger/fileLogger";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";

export const LLM_KEY_VERIFY_TIMEOUT_MS = 8000;
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_WORKSPACE_HEADER = "anthropic-workspace-id";

/**
 * Why a key was not accepted. `workspace_required`, `invalid_key` and
 * `model_unavailable` mean the provider answered and refused; `unreachable`
 * means the check could not be made (network error, timeout, 5xx, rate
 * limit, refused URL), which says nothing about the key.
 */
export type LLMKeyVerificationCode =
  "workspace_required" | "invalid_key" | "model_unavailable" | "unreachable";

export type LLMKeyVerificationResult = { ok: true } | { ok: false; code: LLMKeyVerificationCode };

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

/** The provider's auth headers first, then the key's custom headers, which win (as in the SDKs). */
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
}

const request = async (url: string, headers: Headers): Promise<ProviderResponse | null> => {
  try {
    const response = await safeFetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(LLM_KEY_VERIFY_TIMEOUT_MS),
    });
    const body = await response.text().catch(() => "");
    return { status: response.status, body };
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
const rejected = (code: LLMKeyVerificationCode): LLMKeyVerificationResult => ({ ok: false, code });

/** 401/403 refuse the key; other non-2xx answers (429, 5xx, ...) are not a verdict on it. */
const classifyStatus = (status: number): LLMKeyVerificationResult | null => {
  if (status === 401 || status === 403) return rejected("invalid_key");
  if (status < 200 || status >= 300) return unreachable;
  return null;
};

/** A listed model check: absent from a list the endpoint returned means this key cannot use it. */
const checkModelInList = (body: string, model: string): LLMKeyVerificationResult => {
  const ids = modelIdsFrom(body);
  if (ids && !ids.includes(model)) return rejected("model_unavailable");
  return { ok: true };
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
    return rejected("workspace_required");
  }
  if (res.status === 404) return rejected("model_unavailable");
  return classifyStatus(res.status) ?? { ok: true };
};

const verifyOpenAI = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  const headers = buildHeaders({ authorization: `Bearer ${input.key}` }, input.custom_headers);
  const res = await request(`${OPENAI_BASE}/models`, headers);
  if (!res) return unreachable;
  return classifyStatus(res.status) ?? checkModelInList(res.body, input.model);
};

const verifyOpenRouter = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  const headers = buildHeaders({ authorization: `Bearer ${input.key}` }, input.custom_headers);
  const res = await request(`${OPENROUTER_BASE}/key`, headers);
  if (!res) return unreachable;
  return classifyStatus(res.status) ?? { ok: true };
};

const verifyCustom = async (input: LLMKeyToVerify): Promise<LLMKeyVerificationResult> => {
  if (!input.url) return unreachable;
  const headers = buildHeaders({ authorization: `Bearer ${input.key}` }, input.custom_headers);
  const res = await request(`${input.url.replace(/\/+$/, "")}/models`, headers);
  if (!res) return unreachable;
  // Some compatible servers have no /models (404/405): that is "cannot check".
  return classifyStatus(res.status) ?? checkModelInList(res.body, input.model);
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
  const result = await verify(input);
  logger.debug(`LLM key check for ${input.name}: ${result.ok ? "accepted" : result.code}`);
  return result;
};
