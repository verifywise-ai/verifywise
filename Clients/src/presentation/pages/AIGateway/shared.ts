import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTheme } from "@mui/material";
import { PROVIDER_ICONS } from "../../components/ProviderIcons";
import { apiServices } from "../../../infrastructure/api/networkServices";

export const sectionTitleSx = { fontWeight: 600, fontSize: 16 };

/** Guardrail action colors — blocked (red) and masked (amber) */
export const GUARDRAIL_ACTION_COLORS = { blocked: "#DC2626", masked: "#D97706" } as const;

/** Format entity_type from DB snake_case to human-readable */
export const formatEntityType = (t?: string | null) => (t || "Unknown").replace(/_/g, " ");

/** MCP status chip colors — reused across Audit Log, Approvals, and other MCP pages */
export const MCP_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  success: { bg: "#ECFDF5", text: "#065F46" },
  approved: { bg: "#ECFDF5", text: "#065F46" },
  error: { bg: "#FEF2F2", text: "#991B1B" },
  denied: { bg: "#FEF2F2", text: "#991B1B" },
  blocked: { bg: "#FFF7ED", text: "#9A3412" },
  pending: { bg: "#FFFBEB", text: "#92400E" },
  rate_limited: { bg: "#FFFBEB", text: "#92400E" },
  approval_required: { bg: "#F5F3FF", text: "#5B21B6" },
} as const;

export const MCP_STATUS_FALLBACK = { bg: "#F3F4F6", text: "#374151" } as const;

export function useCardSx() {
  const theme = useTheme();
  return {
    background: theme.palette.background.paper,
    border: `1.5px solid ${theme.palette.border.light}`,
    borderRadius: theme.shape.borderRadius,
    p: "16px",
    boxShadow: "none",
  };
}

/**
 * Maps AI Gateway provider IDs (lowercase) to ProviderIcons keys.
 * Covers all top providers + common LiteLLM provider strings.
 */
const GATEWAY_PROVIDER_MAP: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google",
  google: "Google",
  mistral: "Mistral",
  xai: "Groq", // xAI uses Groq icon as closest match
  openrouter: "OpenRouter",
  bedrock: "Aws",
  azure: "Microsoft",
  azure_ai: "Microsoft",
  together_ai: "Together",
  cohere: "Cohere",
  groq: "Groq",
  deepseek: "DeepSeek",
  fireworks_ai: "Fireworks",
  replicate: "Replicate",
  perplexity: "Perplexity",
  ollama: "Ollama",
  huggingface: "HuggingFace",
  cerebras: "Cerebras",
  sambanova: "SambaNova",
  nvidia_nim: "Nvidia",
  meta_llama: "Meta",
  ai21: "Ai21",
  voyage: "Voyage",
  jina_ai: "Jina",
};

/**
 * Get the provider icon component for a gateway provider ID.
 * Returns null if no icon is available.
 */
export function getProviderIcon(
  provider: string,
): React.ComponentType<React.SVGProps<SVGSVGElement>> | null {
  const key = GATEWAY_PROVIDER_MAP[provider.toLowerCase()];
  return key ? PROVIDER_ICONS[key] || null : null;
}

/**
 * Render a provider icon with fallback.
 * Returns the SVG icon element or null if no match.
 */
export function ProviderIcon({ provider, size = 16 }: { provider: string; size?: number }) {
  const IconComponent = getProviderIcon(provider);
  if (!IconComponent) return null;
  return React.createElement(IconComponent, { width: size, height: size });
}

// ─── Shared constants ─────────────────────────────────────────────────────────

/** Top LLM providers for Select dropdowns */
export const TOP_PROVIDERS = [
  { _id: "openai", name: "OpenAI" },
  { _id: "anthropic", name: "Anthropic" },
  { _id: "gemini", name: "Google Gemini" },
  { _id: "mistral", name: "Mistral" },
  { _id: "xai", name: "xAI" },
  { _id: "openrouter", name: "OpenRouter" },
  { _id: "bedrock", name: "AWS Bedrock" },
  { _id: "azure", name: "Azure OpenAI" },
  { _id: "together_ai", name: "Together AI" },
  { _id: "cohere", name: "Cohere" },
];

/**
 * Hook: fetch models from the AI Gateway (LiteLLM registry) and provide
 * provider → model cascading data for Select components.
 *
 * Returns { providers, modelsByProvider, getModelsForProvider, loading, error, reload }
 */
export function useGatewayModels() {
  const [providers, setProviders] = useState<string[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<
    Record<string, { id: string; mode: string }[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/providers", { signal });
      const data = res?.data?.data;
      if (!signal?.aborted && data) {
        // Filter to chat-capable providers, sort alphabetically
        const allProviders: string[] = (data.providers || []).sort();
        const allModels: Record<string, { id: string; provider: string; mode: string }[]> =
          data.models || {};

        // Only keep providers that have chat models
        const filtered: Record<string, { id: string; mode: string }[]> = {};
        for (const p of allProviders) {
          const models = (allModels[p] || [])
            .filter((m: any) => m.mode === "chat" || m.mode === "completion")
            .sort((a: any, b: any) => a.id.localeCompare(b.id));
          if (models.length > 0) filtered[p] = models;
        }

        setProviders(Object.keys(filtered).sort());
        setModelsByProvider(filtered);
      }
    } catch {
      if (!signal?.aborted) setError("Unable to load AI Gateway providers.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /** Get Select-compatible items for a given provider (memoized) */
  const getModelsForProvider = useCallback(
    (provider: string) =>
      (modelsByProvider[provider] || []).map((m) => ({
        _id: `${provider}/${m.id}`,
        name: m.id,
      })),
    [modelsByProvider],
  );

  /** Get Select-compatible provider items (memoized) */
  const providerItems = useMemo(() => providers.map((p) => ({ _id: p, name: p })), [providers]);

  return {
    providers,
    providerItems,
    modelsByProvider,
    getModelsForProvider,
    loading,
    error,
    reload: load,
  };
}

/** Convert a display name to a URL-safe slug */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Gateway base URL for code examples */
export const GATEWAY_URL = (() => {
  const apiUrl = (import.meta as any)?.env?.VITE_APP_API_URL as string | undefined;
  if (apiUrl) return apiUrl.replace(/\/api\/?$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/:\d+$/, ":3000");
  return "https://your-verifywise-host";
})();

/** Color constants for code blocks and warning banners */
export const CODE_BLOCK_BG = "#1E1E1E";
export const CODE_BLOCK_TEXT = "#D4D4D4";
export const WARNING_BG = "#FFFAEB";
export const WARNING_BORDER = "#FEDF89";
export const WARNING_TEXT = "#B54708";
export const KEY_DISPLAY_BG = "#F9FAFB";

/** Full API URL for gateway requests (avoids concatenating "/api" in every file) */
export const GATEWAY_API_URL = GATEWAY_URL + "/api";

// ─── Prompt utilities (shared across Prompt editor, Compare, TestDataset) ────

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/** Extract unique {{varName}} tokens from message content. */
export function extractVars(messages: Array<{ content: string }>): string[] {
  const vars = new Set<string>();
  for (const msg of messages) {
    for (const [, name] of msg.content.matchAll(VARIABLE_PATTERN)) {
      vars.add(name);
    }
  }
  return Array.from(vars);
}

/** Extract unique @prompt:slug references from message content. */
export function extractPromptRefs(messages: Array<{ content: string }>): string[] {
  const refs = new Set<string>();
  for (const msg of messages) {
    for (const [, slug] of msg.content.matchAll(/@prompt:([a-z0-9-]+)/g)) {
      refs.add(slug);
    }
  }
  return Array.from(refs);
}

/** Replace {{varName}} placeholders in messages with provided values. */
export function resolveMessageVariables(
  messages: Array<{ role: string; content: string }>,
  values: Record<string, string>,
): Array<{ role: string; content: string }> {
  return messages.map((m) => ({
    ...m,
    content: m.content.replace(VARIABLE_PATTERN, (_, name) =>
      values[name] !== undefined ? values[name] : `{{${name}}}`,
    ),
  }));
}

/** Label name → Chip variant mapping. Used by PromptEditor and Prompts list. */
export function getLabelVariant(labelName: string): "success" | "warning" | "info" {
  if (labelName === "production") return "success";
  if (labelName === "staging") return "warning";
  return "info";
}

/** Stream a prompt test request and return results via callbacks. */
export interface StreamPromptTestOptions {
  endpointSlug: string;
  messages: Array<{ role: string; content: string }>;
  variables?: Record<string, string>;
  config?: Record<string, any>;
  onDelta: (accumulated: string) => void;
  signal?: AbortSignal;
}

export interface StreamPromptTestResult {
  content: string;
  tokens: number;
  cost: number;
  latency: number;
}

// Raw fetch is intentional here — Axios does not support SSE streaming.
// See: https://github.com/axios/axios/issues/1474
import { getAuthToken } from "../../../application/redux/auth/getAuthToken";

export async function streamPromptTest(
  opts: StreamPromptTestOptions,
): Promise<StreamPromptTestResult> {
  const startTime = Date.now();

  const response = await fetch(`/api/ai-gateway/prompts/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      content: opts.messages,
      variables: opts.variables || {},
      config: opts.config || {},
      endpoint_slug: opts.endpointSlug,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    const err = await response.text();
    return { content: `Error: ${err}`, tokens: 0, cost: 0, latency: Date.now() - startTime };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { content: "", tokens: 0, cost: 0, latency: Date.now() - startTime };
  }

  const decoder = new TextDecoder();
  let content = "";
  let tokens = 0;
  let cost = 0;
  let streamError = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const chunk = JSON.parse(line.slice(6));
            if (chunk.error) {
              streamError = chunk.error;
            }
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              opts.onDelta(content);
            }
            if (chunk.usage) tokens = chunk.usage.total_tokens || tokens;
            if (chunk.cost_usd) cost = chunk.cost_usd;
          } catch {
            /* skip unparseable chunk */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!content && streamError) {
    content = `Error: ${streamError}`;
    opts.onDelta(content);
  } else if (!content) {
    content =
      "No response received from the model. Check that the endpoint has a valid API key configured.";
    opts.onDelta(content);
  }

  return { content, tokens, cost, latency: Date.now() - startTime };
}
