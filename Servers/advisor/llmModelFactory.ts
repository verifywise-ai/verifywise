import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LLMProvider = "Anthropic" | "OpenAI";

/** Raw `llm_keys` row shape. There is no `provider` column — it is inferred. */
export interface LLMKeyRow {
  name?: string | null;
  key: string;
  url?: string | null;
  model?: string | null;
  custom_headers?: Record<string, string> | null;
}

export function detectProvider(name: string | null | undefined): LLMProvider {
  const n = (name || "").toLowerCase();
  return n.includes("anthropic") || n.includes("claude") ? "Anthropic" : "OpenAI";
}

/**
 * The model id `createModelFromKey` will actually call out to: `row.model`
 * when set, else the provider's default. Exported so callers that need to
 * *record* which model produced a result (e.g. traceability fields) use the
 * same id the SDK used, rather than persisting `row.model ?? null` and
 * silently losing the default-substitution case.
 */
export function resolveModelId(row: LLMKeyRow): string {
  return row.model || (detectProvider(row.name) === "Anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o-mini");
}

/**
 * Build an AI SDK model from a raw llm_keys row.
 *
 * The openai.chat() branch is load-bearing: only native OpenAI implements the
 * Responses API, so any custom baseURL (OpenRouter, vLLM, Together) must go
 * through Chat Completions or every call fails.
 *
 * Note: llm_keys.url is auto-populated for every non-Custom provider
 * (llmKey.ctrl.ts:155,263), so in practice baseURL is set for nearly every key
 * and this routes almost all traffic through Chat Completions — including
 * native OpenAI. That is deliberate: Chat Completions is universally
 * supported, and it is the path aiSummarizer has been using in production.
 * The bare-callable branch remains for keys with genuinely no url.
 */
export function createModelFromKey(row: LLMKeyRow) {
  const headers = row.custom_headers || undefined;
  const baseURL = row.url || undefined;
  const modelId = resolveModelId(row);

  if (detectProvider(row.name) === "Anthropic") {
    return createAnthropic({
      apiKey: row.key,
      baseURL,
      headers,
    })(modelId);
  }

  const openai = createOpenAI({ apiKey: row.key, baseURL, headers });
  return baseURL ? openai.chat(modelId) : openai(modelId);
}
