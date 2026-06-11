/**
 * Phase 5 — Command Planner (issue 3812).
 *
 * Decomposes one natural-language command into an ordered list of
 * CommandStep via the AI SDK `generateObject` call (Zod-schema constrained),
 * then enriches each step:
 *   - `agent`   — assigned via classifyIntent(step.description) from the
 *                 routing engine (first matched agent, else "coordinator").
 *   - `requiresApproval` — true for create/update/delete intents (write
 *                 actions gate through the approval gateway at execution).
 *
 * The LLM call is dependency-injectable (`generateImpl`) so unit tests run
 * without hitting a real model — mirrors the pattern in llmSelfCorrect.ts.
 */

import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { classifyIntent } from "../network/routingEngine";
import type { GenerateObjectImpl } from "../llmSelfCorrect";
import type { CommandStep } from "../commandEngine/types";
import logger from "../../utils/logger/fileLogger";

/**
 * LLM key needed to build a model for the planner call. Same shape used by
 * the evidence analyzer.
 */
export interface PlannerLLMKey {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: "Anthropic" | "OpenAI" | "OpenRouter" | "Custom";
  headers?: Record<string, string>;
}

export interface PlanMultiStepCommandOptions {
  llmKey: PlannerLLMKey;
}

/**
 * Zod schema the LLM must satisfy: an ordered list of raw steps. The planner
 * derives `order`, `agent`, and `requiresApproval` itself — the model only
 * proposes the decomposition.
 */
const rawStepSchema = z.object({
  description: z.string().describe("What this step accomplishes, in plain language"),
  intent: z
    .string()
    .describe(
      "The action intent for this step: read, create, update, or delete (use create/update/delete for any write).",
    ),
  toolName: z.string().optional().describe("The tool this step should invoke, if known"),
  inputs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Known input parameters for the step's tool"),
});

const commandPlanSchema = z.object({
  steps: z.array(rawStepSchema).describe("The ordered steps that fulfil the command"),
});

type RawStep = z.infer<typeof rawStepSchema>;

const SYSTEM_PROMPT = [
  "You are a command planner for the VerifyWise AI governance platform.",
  "Decompose the user's single natural-language command into the minimal ordered",
  "list of concrete steps needed to fulfil it. Each step is one discrete action.",
  "",
  "For each step set `intent` to exactly one of: read, create, update, delete.",
  "Use read for lookups/listings/queries. Use create/update/delete for any action",
  "that writes, modifies, or removes data.",
  "Keep steps in execution order — later steps may depend on earlier results.",
  "Do not invent steps the command does not ask for.",
].join("\n");

/**
 * Build the AI SDK model for the planner call.
 */
function buildModel(key: PlannerLLMKey) {
  if (key.provider === "Anthropic") {
    return createAnthropic({
      apiKey: key.apiKey,
      baseURL: key.baseURL || undefined,
      headers: key.headers,
    })(key.model);
  }
  return createOpenAI({
    apiKey: key.apiKey,
    baseURL: key.baseURL,
    headers: key.headers,
  })(key.model);
}

/**
 * Write intents always require approval. Read (and anything else) does not.
 */
function intentRequiresApproval(intent: string): boolean {
  const i = intent.toLowerCase();
  return i.includes("create") || i.includes("update") || i.includes("delete");
}

/**
 * Plan a multi-step command. Returns the ordered, enriched CommandStep[].
 *
 * @param command       The raw natural-language command.
 * @param opts          Planner options (LLM key).
 * @param generateImpl  Optional generateObject override for tests.
 */
export async function planMultiStepCommand(
  command: string,
  opts: PlanMultiStepCommandOptions,
  generateImpl?: GenerateObjectImpl,
): Promise<CommandStep[]> {
  const gen = generateImpl ?? (generateObject as unknown as GenerateObjectImpl);

  const model = buildModel(opts.llmKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { object } = await gen({
    model,
    schema: commandPlanSchema,
    system: SYSTEM_PROMPT,
    prompt: command,
    temperature: 0,
  } as any);

  const rawSteps: RawStep[] = ((object as { steps?: RawStep[] })?.steps ?? []) as RawStep[];

  const steps: CommandStep[] = rawSteps.map((raw, index) => {
    const decision = classifyIntent(raw.description);
    const agent = decision.agents[0] ?? "coordinator";

    return {
      order: index + 1,
      description: raw.description,
      intent: raw.intent,
      agent,
      toolName: raw.toolName,
      requiresApproval: intentRequiresApproval(raw.intent),
      inputs: raw.inputs ?? {},
    };
  });

  logger.debug(
    `[commandPlanner] planned ${steps.length} step(s) for command: "${command.slice(0, 80)}"`,
  );

  return steps;
}
