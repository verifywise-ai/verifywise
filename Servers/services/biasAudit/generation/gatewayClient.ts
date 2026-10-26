import { createHash } from "node:crypto";
import type { GatewaySettings } from "./settings";

export interface CompletionResult {
  text: string;
  /** The model the response says it came from, not the one requested. */
  modelObserved: string;
  /** sha256 of the prompt, hex. */
  promptHash: string;
  /** choices[0].finish_reason; not judged here ("stop" is the only clean end). */
  finishReason: string | null;
}

export interface CompleteOptions {
  retries?: number;
  retryDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRY_AFTER_MS = 60_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const retryable = (status: number) => status === 408 || status === 429 || status >= 500;
/** Statuses a provider uses to refuse the content of one prompt. */
const CONTENT_REFUSAL_STATUSES = new Set([400, 403, 422]);
/**
 * Words a provider or the AI Gateway puts in a refusal of one prompt's
 * content ("content_filter", "content_policy_violation", "our safety system",
 * "Request blocked by guardrail: …"). Bare "safety" and "moderation" also name
 * request parameters, so they are not enough. The body is read for these only
 * and never logged or quoted, since it can echo the request.
 */
const CONTENT_REFUSAL =
  /content[\s_-]?(?:filter|policy|management|moderation)|flagged|safety[\s_-]system|guardrail|policy[\s_-]violation/i;
/** A malformed request ("Unknown parameter: safety_identifier") is the deployment's fault. */
const PARAMETER_ERROR =
  /\b(?:unknown|unrecognized|invalid|unsupported)[\s_-]+(?:parameter|argument|field)/i;

/** The gateway request failed. The message is fixed text plus a status, never a body. */
export class GatewayRequestError extends Error {
  constructor(readonly detail: string) {
    super(`Gateway request failed: ${detail}`);
    this.name = "GatewayRequestError";
  }
}

/**
 * The gateway refused the content of this one prompt (a 400, 403 or 422 whose
 * body names a content filter, policy or moderation). Asking again sends the same
 * prompt, so the caller logs it as an invalid attempt rather than failing the
 * whole corpus.
 */
export class GatewayPromptRefusedError extends GatewayRequestError {
  constructor(readonly status: number) {
    super(`status ${status}`);
    this.name = "GatewayPromptRefusedError";
  }
}

/** Retry-After as delta-seconds or an HTTP date, in ms, capped. Null if absent or unusable. */
function retryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(v)) ms = Number(v) * 1000;
  else {
    const at = Date.parse(v);
    if (Number.isNaN(at)) return null;
    ms = at - Date.now();
  }
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

/** The error body, for the refusal words only; never logged or quoted. */
async function bodyText(res: Response): Promise<string> {
  try {
    return typeof res.text === "function" ? await res.text() : "";
  } catch {
    return "";
  }
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // body already consumed or locked; nothing to release
  }
}

/**
 * One chat completion against the OpenAI-compatible gateway. Every error
 * message is fixed text plus a status code; response bodies and caught
 * errors can carry the key and are never interpolated.
 */
export async function complete(
  settings: GatewaySettings,
  prompt: string,
  opts: CompleteOptions = {},
): Promise<CompletionResult> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const base = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const promptHash = createHash("sha256").update(prompt).digest("hex");

  let lastDetail = "no attempt made";
  let wait = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(wait);
    // Exponential backoff with jitter, overridden by Retry-After on a 429.
    wait = base * 2 ** attempt * (0.5 + Math.random() * 0.5);

    let data: any;
    try {
      const res = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        lastDetail = `status ${res.status}`;
        const hinted = res.status === 429 ? retryAfterMs(res.headers?.get?.("retry-after")) : null;
        // Only a refusal of this prompt's content is the prompt's fault. Any
        // other 4xx (a budget 402, an unknown model 400, a bad key 401) is the
        // deployment's, and fails the corpus so it can be resumed once fixed.
        const body = CONTENT_REFUSAL_STATUSES.has(res.status) ? await bodyText(res) : "";
        const refusesContent = CONTENT_REFUSAL.test(body) && !PARAMETER_ERROR.test(body);
        await discard(res);
        if (!retryable(res.status)) {
          if (refusesContent) throw new GatewayPromptRefusedError(res.status);
          throw new GatewayRequestError(lastDetail);
        }
        if (hinted !== null) wait = hinted;
        continue;
      }
      data = await res.json();
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error("Gateway returned an unexpected response: not JSON.");
      }
      if (e instanceof GatewayRequestError) throw e;
      // TypeError, TimeoutError, AbortError: transport faults while connecting or reading.
      lastDetail = "network error";
      continue;
    }

    const choice = data?.choices?.[0];
    const text = choice?.message?.content;
    if (typeof data?.model !== "string" || typeof text !== "string") {
      throw new Error("Gateway returned an unexpected response: missing model or content.");
    }
    const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : null;
    return { text, modelObserved: data.model, promptHash, finishReason };
  }
  throw new GatewayRequestError(lastDetail);
}
