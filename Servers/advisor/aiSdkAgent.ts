import { streamText, tool, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getAdvisorPrompt } from "./prompts";
import { bridgeTools } from "./toolBridge";
import logger from "../utils/logger/fileLogger";

export interface StreamChunk {
  type: "text" | "status";
  content: string;
}

interface AiSdkAdvisorParams {
  apiKey: string;
  baseURL: string;
  model: string;
  userPrompt: string;
  tenant: number;
  availableTools: Record<string, (params: Record<string, unknown>, tenant: number) => Promise<unknown>>;
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
}

/**
 * Create the appropriate AI SDK model instance based on provider.
 */
function createModel(params: Pick<AiSdkAdvisorParams, "provider" | "apiKey" | "baseURL" | "model" | "headers">) {
  if (params.provider === "Anthropic") {
    const anthropic = createAnthropic({
      apiKey: params.apiKey,
      baseURL: params.baseURL || undefined,
      headers: params.headers,
    });
    return anthropic(params.model);
  }

  // OpenAI, OpenRouter, and Custom all use the OpenAI-compatible interface
  const openai = createOpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    headers: params.headers,
  });
  return openai(params.model);
}

/**
 * Zod-validated generate_chart tool. The LLM calls this to produce structured chart data
 * instead of using the ---CHART_DATA--- separator convention.
 * The execute function is a pass-through: the chart spec IS the result.
 */
const chartInputSchema = z.object({
  type: z.enum(["pie", "bar", "line", "table", "donut"]).describe("Chart type: pie for distributions, bar for comparisons, line for trends, table for listings/metrics, donut for proportions"),
  title: z.string().describe("Chart title"),
  data: z.array(z.object({
    label: z.string(),
    value: z.number(),
    color: z.string().optional(),
  })).optional().describe("Data points for pie, bar, donut, or simple table charts"),
  columns: z.array(z.string()).optional().describe("Column headers for multi-column table"),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).optional().describe("Row data for multi-column table"),
  series: z.array(z.object({
    label: z.string(),
    data: z.array(z.number()),
  })).optional().describe("Data series for line charts"),
  xAxisLabels: z.array(z.string()).optional().describe("X-axis labels for line charts"),
});

type ChartInput = z.infer<typeof chartInputSchema>;

const generateChartTool = tool({
  description: "Generate a chart visualization after data analysis. Call this tool to create a visual chart from your analysis results. Pick the best chart type for the data.",
  inputSchema: chartInputSchema,
  execute: async (input: ChartInput) => input, // pass-through — chart spec IS the result
});

/**
 * Build the complete tools record: bridged legacy tools + native generate_chart.
 */
function buildTools(
  toolsDefinition: AiSdkAdvisorParams["toolsDefinition"],
  availableTools: AiSdkAdvisorParams["availableTools"],
  tenant: number
): ToolSet {
  const bridged = bridgeTools(toolsDefinition, availableTools, tenant);
  return {
    ...bridged,
    generate_chart: generateChartTool,
  };
}

/**
 * Streaming advisor using AI SDK streamText with automatic tool loop.
 * Yields the same StreamChunk format as the old agent for backward compatibility
 * with the manual SSE controller path.
 */
export async function* streamAdvisorAiSdk(
  params: AiSdkAdvisorParams
): AsyncGenerator<StreamChunk, void> {
  const agentStartTime = Date.now();
  logger.debug(`[AI-SDK] streamAdvisor started for ${params.provider} with model ${params.model}`);

  const model = createModel(params);
  const tools = buildTools(params.toolsDefinition, params.availableTools, params.tenant);

  const result = streamText({
    model,
    system: getAdvisorPrompt(),
    messages: [{ role: "user", content: params.userPrompt }],
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 4096,
    onStepFinish: ({ toolCalls, text }) => {
      if (toolCalls && toolCalls.length > 0) {
        const toolNames = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
        logger.debug(`[AI-SDK] Tool step completed: ${toolNames}`);
      } else {
        logger.debug(`[AI-SDK] Text step completed, text length: ${text?.length || 0}`);
      }
    },
  });

  let hasYieldedStatus = false;
  let chunkCount = 0;
  let firstChunkTime = 0;

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      chunkCount++;
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

  const agentEndTime = Date.now();
  logger.debug(
    `[AI-SDK] streamAdvisor completed in ${agentEndTime - agentStartTime}ms (${((agentEndTime - agentStartTime) / 1000).toFixed(2)}s), ${chunkCount} text chunks`
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
  const tools = buildTools(params.toolsDefinition, params.availableTools, params.tenant);

  const result = streamText({
    model,
    system: getAdvisorPrompt(),
    messages: [{ role: "user", content: params.userPrompt }],
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 4096,
  });

  const text = await result.text;

  const agentEndTime = Date.now();
  logger.debug(
    `[AI-SDK] runAdvisor completed in ${agentEndTime - agentStartTime}ms (${((agentEndTime - agentStartTime) / 1000).toFixed(2)}s)`
  );

  return text;
}

/**
 * Get the AI SDK streamText result directly for use with pipeUIMessageStreamToResponse.
 * Used by the controller when serving the native AI SDK streaming protocol.
 */
export function getStreamTextResult(params: AiSdkAdvisorParams) {
  logger.debug(`[AI-SDK] getStreamTextResult started for ${params.provider} with model ${params.model}`);

  const model = createModel(params);
  const tools = buildTools(params.toolsDefinition, params.availableTools, params.tenant);

  return streamText({
    model,
    system: getAdvisorPrompt(),
    messages: [{ role: "user", content: params.userPrompt }],
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 4096,
    onStepFinish: ({ toolCalls }) => {
      if (toolCalls && toolCalls.length > 0) {
        const toolNames = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
        logger.debug(`[AI-SDK] Tool step completed: ${toolNames}`);
      }
    },
  });
}
