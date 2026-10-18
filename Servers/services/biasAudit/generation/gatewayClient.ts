import { createHash } from "node:crypto";
import type { GatewaySettings } from "./settings";

export interface CompletionResult {
  text: string;
  /** The model the response says it came from, not the one requested. */
  modelObserved: string;
  /** sha256 of the prompt, hex. */
  promptHash: string;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 120_000;

function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const retryable = (status: number) => status === 429 || status >= 500;

/**
 * One chat completion against the OpenAI-compatible gateway. Every error
 * message is built here from a status code or a fixed phrase; response bodies
 * and caught errors can carry the key and are never interpolated.
 */
export async function complete(
  settings: GatewaySettings,
  prompt: string,
  opts: { retries?: number; retryDelayMs?: number } = {},
): Promise<CompletionResult> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const delay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  const fail = (detail: string) =>
    new Error(scrub(`Gateway request failed: ${detail}`, settings.apiKey));

  let lastDetail = "no attempt made";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delay * attempt);

    let res: Response;
    try {
      res = await fetch(`${settings.baseUrl}/chat/completions`, {
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
    } catch {
      lastDetail = "network error";
      continue;
    }

    if (!res.ok) {
      lastDetail = `status ${res.status}`;
      if (retryable(res.status)) continue;
      throw fail(lastDetail);
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error("Gateway returned an unexpected response: not JSON.");
    }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof data?.model !== "string" || typeof text !== "string") {
      throw new Error("Gateway returned an unexpected response: missing model or content.");
    }
    return { text, modelObserved: data.model, promptHash };
  }
  throw fail(lastDetail);
}
