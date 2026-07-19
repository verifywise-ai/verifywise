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

  if (detectProvider(row.name) === "Anthropic") {
    return createAnthropic({
      apiKey: row.key,
      baseURL,
      headers,
    })(row.model || "claude-sonnet-4-20250514");
  }

  const openai = createOpenAI({ apiKey: row.key, baseURL, headers });
  const modelId = row.model || "gpt-4o-mini";
  return baseURL ? openai.chat(modelId) : openai(modelId);
}
