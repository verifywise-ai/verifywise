import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTheme } from "@mui/material";
import { PROVIDER_ICONS } from "../../components/ProviderIcons";
import { apiServices } from "../../../infrastructure/api/networkServices";
import palette from "../../themes/palette";

export const sectionTitleSx = { fontWeight: 600, fontSize: 16 };

/** Section label inside the agent-control drawers. */
export const drawerLabelSx = {
  fontSize: 11,
  fontWeight: 600,
  color: palette.text.tertiary,
  letterSpacing: "0.5px",
  mb: "6px",
};

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
  // Monitor-only keys: the call went through, so these use softer tones than
  // the blocked / denied / approval colours above.
  would_block: { bg: palette.status.warning.bg, text: palette.status.warning.text },
  would_need_approval: { bg: palette.status.default.bg, text: palette.status.default.text },
} as const;

export const MCP_STATUS_FALLBACK = { bg: "#F3F4F6", text: "#374151" } as const;

const MCP_STATUS_LABELS: Record<string, string> = {
  would_block: "Would block",
  would_need_approval: "Would need approval",
};

/** A stored tool-call status ("approval_required") as screen text ("approval required"). */
export const formatMcpStatus = (status: string) =>
  MCP_STATUS_LABELS[status] ?? status.replace(/_/g, " ");

/**
 * An events-timeline entry type as screen text: the monitor only outcomes use
 * the same labels as the status chip; other types are shown as stored.
 */
export const formatMcpEventType = (type: string) => MCP_STATUS_LABELS[type] ?? type;

/**
 * Which check produced a monitor only outcome, as recorded by the gateway on
 * each would_* event: a guardrail, a require_approval rule (native hook), the
 * key's tool lists (MCP proxy, and native calls when the key opts in) or a
 * tool's requires-approval flag (MCP proxy only).
 */
export type MonitorOutcomeSource =
  "guardrail" | "approval_rule" | "tool_acl" | "tool_requires_approval";

/**
 * The decision-provenance line for an invocation: which rule blocked, paused,
 * or (for a monitor-only key) would have blocked or paused the call. Returns
 * an English template for `t()` plus the values to `fill()` it with, or null
 * when there is nothing to show. A monitor row without a rule names the tool
 * list or the tool's approval flag only when the gateway recorded that source.
 */
export function describeMcpDecision(
  status: string,
  ruleName: string | null | undefined,
  source?: string | null,
): { heading: string; template: string; values: Record<string, string> } | null {
  const monitor = (template: string, values: Record<string, string> = {}) => ({
    heading: "Monitor only",
    template,
    values,
  });
  if (status === "would_block") {
    if (ruleName) return monitor("Would have been blocked by {rule}", { rule: ruleName });
    return source === "tool_acl"
      ? monitor("Would have been blocked by this key's tool list")
      : monitor("Would have been blocked by a guardrail");
  }
  if (status === "would_need_approval") {
    if (ruleName) return monitor("Would have needed approval: {rule}", { rule: ruleName });
    return source === "tool_requires_approval"
      ? monitor("Would have needed approval (tool requires approval)")
      : monitor("Would have needed approval");
  }
  if (!ruleName) return null;
  return {
    heading: status === "approval_required" ? "Approval required by rule" : "Blocked by rule",
    template: "{rule}",
    values: { rule: ruleName },
  };
}

/** How an agent key applies policy: "enforce" blocks and pauses, "monitor" only records. */
export type EnforcementMode = "enforce" | "monitor";

export const ENFORCEMENT_MODE_ITEMS: { _id: EnforcementMode; name: string }[] = [
  { _id: "enforce", name: "Enforce" },
  { _id: "monitor", name: "Monitor only" },
];

export const MONITOR_MODE_HELPER =
  "Rules are checked and logged but never block or pause calls. Rate limits still apply.";

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
  // LiteLLM provider strings that belong to a provider above.
  vercel_ai_gateway: "Vercel",
  v0: "Vercel",
  vertex_ai: "Google",
  google_pse: "Google",
  sagemaker: "Aws",
  amazon_nova: "Aws",
  aws_polly: "Aws",
  agentcore: "Aws",
  transcribe: "Aws",
  chatgpt: "OpenAI",
  azure_text: "Microsoft",
  microsoft_365_copilot: "Microsoft",
  bing_grounding: "Microsoft",
  cohere_chat: "Cohere",
  codestral: "Mistral",
  meta: "Meta",
  anyscale: "Anyscale",
  baseten: "Baseten",
  stability: "Stability",
  elevenlabs: "ElevenLabs",
  assemblyai: "AssemblyAI",
  vllm: "Vllm",
  hosted_vllm: "Vllm",
};

/**
 * Reduce a LiteLLM provider string to a key of GATEWAY_PROVIDER_MAP:
 * "vertex_ai-anthropic_models" → "vertex_ai", "text-completion-openai" →
 * "openai", "fireworks_ai-embedding-models" → "fireworks_ai".
 */
function normalizeProvider(provider: string): string {
  const p = provider.toLowerCase().replace(/^text-completion-/, "");
  if (p.startsWith("vertex_ai")) return "vertex_ai";
  if (p.startsWith("bedrock")) return "bedrock";
  return p.replace(/-[a-z0-9_-]*models$/, "");
}

/**
 * Get the provider icon component for a gateway provider ID.
 * Returns null if no icon is available.
 */
export function getProviderIcon(
  provider: string,
): React.ComponentType<React.SVGProps<SVGSVGElement>> | null {
  const key = GATEWAY_PROVIDER_MAP[normalizeProvider(provider)];
  return key ? PROVIDER_ICONS[key] || null : null;
}

/**
 * Render a provider icon. A provider without a logo gets a neutral tile
 * with its initial, the same size as the logos, so rows line up.
 */
export function ProviderIcon({ provider, size = 16 }: { provider: string; size?: number }) {
  const IconComponent = getProviderIcon(provider);
  if (IconComponent) return React.createElement(IconComponent, { width: size, height: size });
  const initial = provider
    .replace(/[^a-z0-9]/gi, "")
    .charAt(0)
    .toUpperCase();
  if (!initial) return null;
  return React.createElement(
    "span",
    {
      "aria-hidden": true,
      "data-testid": "provider-icon-fallback",
      "style": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        boxSizing: "border-box",
        border: `1px solid ${palette.border.dark}`,
        borderRadius: 4,
        background: palette.background.alt,
        color: palette.text.tertiary,
        fontSize: Math.max(8, Math.round(size * 0.55)),
        fontWeight: 600,
        lineHeight: 1,
      },
    },
    initial,
  );
}

// ─── Shared constants ─────────────────────────────────────────────────────────

/**
 * Providers an API key can be stored for. Must match VALID_PROVIDERS in
 * AIGateway/src/routers/api_keys.py, which rejects anything else. Each of these
 * works with a single API key; providers that also need a base URL, API version
 * or cloud credentials (Azure OpenAI, AWS Bedrock) are not supported yet.
 */
export const API_KEY_PROVIDERS = [
  { _id: "openai", name: "OpenAI" },
  { _id: "anthropic", name: "Anthropic" },
  { _id: "gemini", name: "Google Gemini" },
  { _id: "mistral", name: "Mistral" },
  { _id: "xai", name: "xAI" },
  { _id: "openrouter", name: "OpenRouter" },
  { _id: "together_ai", name: "Together AI" },
  { _id: "cohere", name: "Cohere" },
];

const API_KEY_PROVIDER_IDS = new Set(API_KEY_PROVIDERS.map((p) => p._id));

type ModelItem = { _id: string; name: string };
const NO_MODEL_ITEMS: ModelItem[] = [];

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

        // Only keep providers that an API key can be stored for and that have chat models
        const filtered: Record<string, { id: string; mode: string }[]> = {};
        for (const p of allProviders) {
          if (!API_KEY_PROVIDER_IDS.has(p)) continue;
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

  /**
   * Select-compatible items per provider, built once per load.
   * LiteLLM lists some models with the provider prefix ("gemini/gemini-2.5-flash")
   * and some without ("gpt-4o"), and a few both ways. The value is always
   * "<provider>/<model>" exactly once, and each model appears once.
   */
  const itemsByProvider = useMemo(() => {
    const result: Record<string, ModelItem[]> = {};
    for (const [provider, models] of Object.entries(modelsByProvider)) {
      const prefix = `${provider}/`;
      const items = new Map<string, ModelItem>();
      for (const m of models) {
        const name = m.id.startsWith(prefix) ? m.id.slice(prefix.length) : m.id;
        items.set(name, { _id: `${prefix}${name}`, name });
      }
      result[provider] = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [modelsByProvider]);

  /** Get Select-compatible items for a given provider (stable array identity) */
  const getModelsForProvider = useCallback(
    (provider: string) => itemsByProvider[provider] ?? NO_MODEL_ITEMS,
    [itemsByProvider],
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
