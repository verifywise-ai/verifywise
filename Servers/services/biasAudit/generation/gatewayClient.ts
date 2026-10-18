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

const retryable = (status: number) => status === 429 || status >= 500;

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
        await discard(res);
        if (!retryable(res.status)) throw new Error(`Gateway request failed: ${lastDetail}`);
        if (hinted !== null) wait = hinted;
        continue;
      }
      data = await res.json();
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error("Gateway returned an unexpected response: not JSON.");
      }
      if (e instanceof Error && e.message === `Gateway request failed: ${lastDetail}`) throw e;
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
  throw new Error(`Gateway request failed: ${lastDetail}`);
}
