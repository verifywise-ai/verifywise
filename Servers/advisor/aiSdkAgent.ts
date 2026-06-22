import { streamText, tool, stepCountIs } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getAdvisorPrompt } from "./prompts";
import { bridgeTools } from "./toolBridge";
import logger from "../utils/logger/fileLogger";
import {
  saveMessage as saveAgentMessage,
  getMessages as getAgentMessages,
} from "./memory/memoryService";
import { selectActiveTools } from "./routing";

export interface StreamChunk {
  type: "text" | "status";
  content: string;
}

export interface AiSdkAdvisorParams {
  apiKey: string;
  baseURL: string;
  model: string;
  /**
   * Single-turn prompt. Used by the legacy `/advisor` and `/advisor/stream`
   * endpoints, which do not pass conversation history. Ignored when
   * `messages` is provided.
   */
  userPrompt: string;
  /**
   * Full multi-turn history. Used by `/advisor/chat` (streamAdvisorV2) so the
   * LLM sees prior user + assistant turns. When set, this takes precedence
   * over `userPrompt`.
   */
  messages?: ModelMessage[];
  tenant: number;
  /** Requesting user id — required by write tools so actions can be attributed. */
  userId?: number;
  availableTools: Record<
    string,
    (params: Record<string, unknown>, tenant: number, userId?: number) => Promise<unknown>
  >;
  toolsDefinition: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  provider: "Anthropic" | "OpenAI" | "OpenRouter" | "Custom";
  headers?: Record<string, string>;
  /**
   * Session identifier used to group agent_message_history rows. When omitted,
   * memory persistence is skipped entirely — preserves backward compatibility
   * with callers that haven't been updated yet.
   */
  sessionId?: string;
  /**
   * Agent name for the per-agent memory partition. Defaults to "advisor"
   * for the main pipeline. Specialized agents (risk-agent, vendor-agent,
   * etc.) should pass their own name when they get their own LLM calls.
   */
  agentName?: string;
  /**
   * Whether to use agent-scoped tool subsetting. When true (default), the
   * router picks the most relevant agents based on the user message and
   * passes only their tool subsets + universal tools to the LLM, cutting
   * prompt token cost and improving tool-selection accuracy.
   *
   * Set to false to send the full tool catalogue (legacy behaviour) — useful
   * for debugging or for callers that already do their own filtering.
   */
  enableToolSubsetting?: boolean;
}

/**
 * Create the appropriate AI SDK model instance based on provider.
 */
function createModel(
  params: Pick<AiSdkAdvisorParams, "provider" | "apiKey" | "baseURL" | "model" | "headers">,
) {
  if (params.provider === "Anthropic") {
    const anthropic = createAnthropic({
      apiKey: params.apiKey,
      baseURL: params.baseURL || undefined,
      headers: params.headers,
    });
    return anthropic(params.model);
  }

  // OpenAI, OpenRouter, and Custom all use the OpenAI-compatible interface.
  // Only native OpenAI implements the Responses API — OpenRouter and most
  // OpenAI-compatible servers only implement Chat Completions, so force
  // .chat() for them. Calling openai(model) defaults to Responses in v3.
  const openai = createOpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    headers: params.headers,
  });
  if (params.provider === "OpenAI") {
    return openai(params.model);
  }
  return openai.chat(params.model);
}

/**
 * Zod-validated generate_chart tool. The LLM calls this to produce structured chart data
 * instead of using the ---CHART_DATA--- separator convention.
 * The execute function is a pass-through: the chart spec IS the result.
 */
const chartInputSchema = z.object({
  type: z
    .enum(["pie", "bar", "line", "table", "donut"])
    .describe(
      "Chart type: pie for distributions, bar for comparisons, line for trends, table for listings/metrics, donut for proportions",
    ),
  title: z.string().describe("Chart title"),
  data: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        color: z.string().optional(),
      }),
    )
    .optional()
    .describe("Data points for pie, bar, donut, or simple table charts"),
  columns: z.array(z.string()).optional().describe("Column headers for multi-column table"),
  rows: z
    .array(z.array(z.union([z.string(), z.number()])))
    .optional()
    .describe("Row data for multi-column table"),
  series: z
    .array(
      z.object({
        label: z.string(),
        data: z.array(z.number()),
      }),
    )
    .optional()
    .describe("Data series for line charts"),
  xAxisLabels: z.array(z.string()).optional().describe("X-axis labels for line charts"),
});

type ChartInput = z.infer<typeof chartInputSchema>;

const generateChartTool = tool({
  description:
    "Generate a chart visualization after data analysis. Call this tool to create a visual chart from your analysis results. Pick the best chart type for the data.",
  inputSchema: chartInputSchema,
  execute: async (input: ChartInput) => input, // pass-through — chart spec IS the result
});

/**
 * Pick the `messages` array for streamText. Prefers full multi-turn history
 * when the caller supplies it; otherwise builds a single-turn message array
 * — optionally augmented with prior turns hydrated from agent memory when
 * a sessionId is available.
 *
 * The chat endpoint (streamAdvisorV2) already supplies `messages` from the
 * client, so this hydration only kicks in for legacy `/advisor` and
 * `/advisor/stream` callers that don't track conversation history client-side.
 */
async function selectMessages(params: AiSdkAdvisorParams): Promise<ModelMessage[]> {
  if (params.messages && params.messages.length > 0) {
    return params.messages;
  }

  // Legacy single-turn path. If a sessionId is present, hydrate the recent
  // history from agent memory so the LLM sees prior context. Cap at 20
  // messages to stay well under the model context limit.
  if (memoryEnabled(params)) {
    try {
      const prior = await getAgentMessages(
        params.tenant,
        params.agentName || "advisor",
        params.sessionId!,
        20,
      );
      const hydrated: ModelMessage[] = prior
        .filter((m) => ["user", "assistant", "system"].includes(m.role.toLowerCase()))
        .map((m) => ({
          role: m.role.toLowerCase() as "user" | "assistant" | "system",
          content: m.content,
        }));
      if (hydrated.length > 0) {
        logger.debug(`[AI-SDK] hydrated ${hydrated.length} prior messages from agent memory`);
        return [...hydrated, { role: "user", content: params.userPrompt }];
      }
    } catch (err) {
      logger.warn("[AI-SDK] memory hydration failed, falling back to single turn", err);
    }
  }

  return [{ role: "user", content: params.userPrompt }];
}

/**
 * Build the complete tools record: bridged legacy tools + native generate_chart.
 */
function buildTools(
  toolsDefinition: AiSdkAdvisorParams["toolsDefinition"],
  availableTools: AiSdkAdvisorParams["availableTools"],
  tenant: number,
  userId?: number,
): ToolSet {
  const bridged = bridgeTools(toolsDefinition, availableTools, tenant, userId);
  return {
    ...bridged,
    generate_chart: generateChartTool,
  };
}

/**
 * Run the tool router against `params` and return the (possibly subsetted)
 * `{availableTools, toolsDefinition}` plus the bridged ToolSet ready for
 * streamText. Falls back transparently to the full catalogue when the
 * router decides to (no match, disabled, error, etc.).
 *
 * Embedding routing is auto-enabled when the LLM provider is OpenAI-compatible
 * (OpenAI / OpenRouter / Custom). For Anthropic-only orgs, keyword scoring
 * is used. Either path produces the same RoutingResult shape, and embedding
 * failures fall through to keyword silently.
 *
 * Logging: emits a single debug line per call with selected agents +
 * tool counts so the routing decision is observable in dev/staging.
 */
async function buildRoutedTools(params: AiSdkAdvisorParams): Promise<ToolSet> {
  const message = extractLatestUserContent(params);

  // Embedding requires an OpenAI-compatible endpoint. Anthropic doesn't
  // expose embeddings via @ai-sdk/anthropic; for those orgs we keep keyword.
  const embeddingKey =
    params.provider === "OpenAI" || params.provider === "OpenRouter" || params.provider === "Custom"
      ? {
          apiKey: params.apiKey,
          baseURL: params.baseURL,
          headers: params.headers,
        }
      : undefined;

  const routed = await selectActiveTools({
    message,
    availableTools: params.availableTools,
    toolsDefinition: params.toolsDefinition,
    enabled: params.enableToolSubsetting !== false,
    embeddingKey,
  });

  const simSummary =
    routed.similarities && routed.similarities.length > 0
      ? ` sim=[${routed.similarities.map((s) => `${s.agent}:${s.similarity}`).join(", ")}]`
      : "";

  logger.debug(
    `[AI-SDK] tool routing: ${routed.reason} · agents=[${routed.selectedAgents.join(", ") || "—"}] · ${routed.metrics.activeCount}/${routed.metrics.fullCount} tools (universal=${routed.metrics.universalCount})${simSummary}`,
  );

  return buildTools(routed.toolsDefinition, routed.availableTools, params.tenant, params.userId);
}

/* ------------------------------------------------------------------ */
/* Memory wiring helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Whether memory persistence is enabled for this call. Memory writes
 * require all four of: organizationId, userId, sessionId, agentName.
 * Missing any one — silently skip. This keeps legacy callers working.
 *
 * Exported for unit testing.
 */
export function memoryEnabled(params: AiSdkAdvisorParams): boolean {
  return (
    !!params.tenant &&
    !!params.userId &&
    !!params.sessionId &&
    typeof params.sessionId === "string" &&
    params.sessionId.trim().length > 0
  );
}

/**
 * Best-effort memory save — never throws. Memory failures should never
 * affect the user-visible response stream.
 */
async function safeSaveMessage(
  params: AiSdkAdvisorParams,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!memoryEnabled(params)) return;
  try {
    await saveAgentMessage(
      params.tenant,
      params.agentName || "advisor",
      params.userId!,
      params.sessionId!,
      role,
      content,
      metadata,
    );
  } catch (err) {
    logger.warn("[AI-SDK] memory save failed (non-critical):", err);
  }
}

/**
 * Snapshot the latest user content from the messages array (or fall back
 * to userPrompt). Used to record the user turn in agent memory.
 *
 * Exported for unit testing.
 */
export function extractLatestUserContent(params: AiSdkAdvisorParams): string {
  if (params.messages && params.messages.length > 0) {
    // Walk back to find the most recent user turn — it's typically the last
    // entry but the AI SDK protocol allows trailing tool/assistant messages.
    for (let i = params.messages.length - 1; i >= 0; i--) {
      const m = params.messages[i];
      if (m.role === "user") {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) {
          // ModelMessage user content can be parts ({type:"text", text})
          return m.content
            .map((p: any) =>
              typeof p === "string"
                ? p
                : p?.type === "text" && typeof p.text === "string"
                  ? p.text
                  : "",
            )
            .filter(Boolean)
            .join("\n");
        }
      }
    }
    return "";
  }
  return params.userPrompt || "";
}

/**
 * Streaming advisor using AI SDK streamText with automatic tool loop.
 * Yields the same StreamChunk format as the old agent for backward compatibility
 * with the manual SSE controller path.
 */
export async function* streamAdvisorAiSdk(
  params: AiSdkAdvisorParams,
): AsyncGenerator<StreamChunk, void> {
  const agentStartTime = Date.now();
  logger.debug(`[AI-SDK] streamAdvisor started for ${params.provider} with model ${params.model}`);

  const model = createModel(params);
  const tools = await buildRoutedTools(params);

  // Persist the inbound user turn (best-effort, fire-and-forget).
  const userContent = extractLatestUserContent(params);
  if (userContent.trim().length > 0) {
    void safeSaveMessage(params, "user", userContent, {
      provider: params.provider,
      model: params.model,
    });
  }

  const result = streamText({
    model,
    system: getAdvisorPrompt(),
    messages: await selectMessages(params),
    tools,
    stopWhen: stepCountIs(12),
    maxOutputTokens: 4096,
    onStepFinish: ({ toolCalls, text }) => {
      if (toolCalls && toolCalls.length > 0) {
        const toolNames = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
        logger.debug(`[AI-SDK] Tool step completed: ${toolNames}`);
        // Record each tool invocation in agent memory. We persist the tool
        // name + a JSON-serialized summary of the input so an admin can
        // reconstruct what the agent did. Output is captured in metadata.
        for (const tc of toolCalls) {
          const inputPreview =
            typeof (tc as any).input === "string"
              ? (tc as any).input
              : JSON.stringify((tc as any).input ?? {}).slice(0, 800);
          void safeSaveMessage(params, "tool", `${tc.toolName}: ${inputPreview}`, {
            toolCallId: (tc as any).toolCallId,
            toolName: tc.toolName,
          });
        }
      } else {
        logger.debug(`[AI-SDK] Text step completed, text length: ${text?.length || 0}`);
      }
    },
  });

  let hasYieldedStatus = false;
  let chunkCount = 0;
  let firstChunkTime = 0;
  let assistantBuffer = "";

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      chunkCount++;
      assistantBuffer += part.text;
      if (chunkCount === 1) {
        firstChunkTime = Date.now();
        logger.debug(`[AI-SDK] First text chunk at +${firstChunkTime - agentStartTime}ms`);
      }
      yield { type: "text", content: part.text };
    } else if (part.type === "tool-call") {
      // Yield a status event when tools are being called
      if (!hasYieldedStatus) {
        yield { type: "status", content: "analyzing" };
        hasYieldedStatus = true;
      }
    } else if (part.type === "finish-step") {
      // Reset status flag for the next step's text stream
      hasYieldedStatus = false;
    }
  }

  // Persist the assembled assistant turn (best-effort).
  if (assistantBuffer.trim().length > 0) {
    void safeSaveMessage(params, "assistant", assistantBuffer, {
      provider: params.provider,
      model: params.model,
      durationMs: Date.now() - agentStartTime,
      chunkCount,
    });
  }

  const agentEndTime = Date.now();
  logger.debug(
    `[AI-SDK] streamAdvisor completed in ${agentEndTime - agentStartTime}ms (${((agentEndTime - agentStartTime) / 1000).toFixed(2)}s), ${chunkCount} text chunks`,
  );
}

/**
 * Non-streaming advisor using AI SDK streamText (consumed to completion).
 * Returns the full text response.
 */
export async function runAdvisorAiSdk(params: AiSdkAdvisorParams): Promise<string> {
  const agentStartTime = Date.now();
  logger.debug(`[AI-SDK] runAdvisor started for ${params.provider} with model ${params.model}`);

  const model = createModel(params);
  const tools = await buildRoutedTools(params);

  const userContent = extractLatestUserContent(params);
  if (userContent.trim().length > 0) {
    void safeSaveMessage(params, "user", userContent, {
      provider: params.provider,
      model: params.model,
    });
  }

  const result = streamText({
    model,
    system: getAdvisorPrompt(),
    messages: await selectMessages(params),
    tools,
    stopWhen: stepCountIs(12),
    maxOutputTokens: 4096,
    onStepFinish: ({ toolCalls }) => {
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const inputPreview =
            typeof (tc as any).input === "string"
              ? (tc as any).input
              : JSON.stringify((tc as any).input ?? {}).slice(0, 800);
          void safeSaveMessage(params, "tool", `${tc.toolName}: ${inputPreview}`, {
            toolCallId: (tc as any).toolCallId,
            toolName: tc.toolName,
          });
        }
      }
    },
  });

  const text = await result.text;

  if (text && text.trim().length > 0) {
    void safeSaveMessage(params, "assistant", text, {
      provider: params.provider,
      model: params.model,
      durationMs: Date.now() - agentStartTime,
    });
  }

  const agentEndTime = Date.now();
  logger.debug(
    `[AI-SDK] runAdvisor completed in ${agentEndTime - agentStartTime}ms (${((agentEndTime - agentStartTime) / 1000).toFixed(2)}s)`,
  );

  return text;
}

/**
 * Get the AI SDK streamText result directly for use with pipeUIMessageStreamToResponse.
 * Used by the controller when serving the native AI SDK streaming protocol.
 */
export async function getStreamTextResult(params: AiSdkAdvisorParams) {
  logger.debug(
    `[AI-SDK] getStreamTextResult started for ${params.provider} with model ${params.model}`,
  );

  const model = createModel(params);
  const tools = await buildRoutedTools(params);
  const startTime = Date.now();
  const messagesForStream = await selectMessages(params);

  // Persist the inbound user turn before the stream begins. Memory writes
  // are best-effort and never block the stream.
  const userContent = extractLatestUserContent(params);
  if (userContent.trim().length > 0) {
    void safeSaveMessage(params, "user", userContent, {
      provider: params.provider,
      model: params.model,
    });
  }

  return streamText({
    model,
    system: getAdvisorPrompt(),
    messages: messagesForStream,
    tools,
    stopWhen: stepCountIs(12),
    maxOutputTokens: 4096,
    onStepFinish: ({ toolCalls }) => {
      if (toolCalls && toolCalls.length > 0) {
        const toolNames = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
        logger.debug(`[AI-SDK] Tool step completed: ${toolNames}`);
        for (const tc of toolCalls) {
          const inputPreview =
            typeof (tc as any).input === "string"
              ? (tc as any).input
              : JSON.stringify((tc as any).input ?? {}).slice(0, 800);
          void safeSaveMessage(params, "tool", `${tc.toolName}: ${inputPreview}`, {
            toolCallId: (tc as any).toolCallId,
            toolName: tc.toolName,
          });
        }
      }
    },
    onFinish: ({ text }) => {
      // Capture the final assembled assistant text once the stream closes.
      if (text && text.trim().length > 0) {
        void safeSaveMessage(params, "assistant", text, {
          provider: params.provider,
          model: params.model,
          durationMs: Date.now() - startTime,
        });
      }
    },
  });
}
