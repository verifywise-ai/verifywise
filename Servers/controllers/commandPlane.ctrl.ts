/**
 * Phase 5 — Command Plane controller (issue 3812).
 *
 * Wires the multi-step command planner + executor to HTTP:
 *
 *   POST /api/advisor/command-plan
 *     body { command: string; llmKeyId?: number } -> { steps: CommandStep[] }
 *     Resolves the org's LLM key, asks the planner to decompose the command
 *     into an ordered CommandStep[], and returns it.
 *
 *   POST /api/advisor/command-execute
 *     body { steps: CommandStep[]; conversationId?: string; llmKeyId?: number }
 *     Streams (SSE) one StepStatusEvent per state transition as the executor
 *     drives the plan, terminating on a completed/failed terminal event.
 *
 * Key selection and SSE plumbing mirror `advisor.ctrl.ts`. Read-step tool
 * executors are resolved from the same `availableTools` registry the advisor
 * uses; write steps gate through the approval gateway inside the executor.
 */

import { Request, Response } from "express";
import { planMultiStepCommand } from "../advisor/commandPlanner/planner";
import { executeCommandSteps } from "../advisor/commandEngine/executor";
import type { CommandStep, StepStatusEvent } from "../advisor/commandEngine/types";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../utils/llmKey.utils";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import { availableTools } from "./advisor.ctrl";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";

const fileName = "commandPlane.ctrl.ts";

/**
 * Select an LLM key by ID, falling back to the first available key.
 * Mirrors `selectLLMKey` in advisor.ctrl.ts (module-private there).
 */
function selectLLMKey(clients: any[], llmKeyId?: number): any {
  if (llmKeyId !== undefined) {
    const found = clients.find((k: any) => k.id === llmKeyId);
    if (found) {
      return found;
    }
    logger.warn(`LLM key ID ${llmKeyId} not found, using default key`);
  }
  return clients[0];
}

/**
 * Build the PlannerLLMKey the planner expects from a raw llm_keys row.
 */
function toPlannerLLMKey(apiKey: any) {
  return {
    apiKey: apiKey.key || "",
    baseURL: apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider),
    model: apiKey.model,
    provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
    headers: apiKey.custom_headers || undefined,
  };
}

/**
 * POST /api/advisor/command-plan
 * Decompose one natural-language command into an ordered CommandStep[].
 */
export async function planCommand(req: Request, res: Response) {
  const functionName = "planCommand";
  logStructured("processing", "Planning multi-step command", functionName, fileName);

  try {
    const command = req.body.command;
    const organizationId = req.organizationId!;
    const llmKeyId = req.body.llmKeyId as number | undefined;

    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: req.t!("Command is required") });
    }

    if (!organizationId) {
      return res.status(400).json({ error: req.t!("Organization context is required") });
    }

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      return res.status(400).json({ error: req.t!("No LLM keys configured for this organization.") });
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const steps = await planMultiStepCommand(command, { llmKey: toPlannerLLMKey(apiKey) });

    logStructured("successful", `Planned ${steps.length} step(s)`, functionName, fileName);
    return res.status(200).json({ steps });
  } catch (error) {
    logStructured("error", "Failed to plan multi-step command", functionName, fileName);
    logger.error("❌ Error planning multi-step command:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * POST /api/advisor/command-execute
 * Drive the ordered steps to completion, streaming a StepStatusEvent per
 * transition over SSE. Terminates on the first completed/failed terminal
 * event (the generator stops yielding) and on client disconnect.
 */
export async function executeCommand(req: Request, res: Response) {
  const functionName = "executeCommand";
  logStructured("processing", "Executing multi-step command", functionName, fileName);

  try {
    const steps = req.body.steps as CommandStep[];
    const conversationId =
      typeof req.body.conversationId === "string" ? req.body.conversationId : undefined;
    const llmKeyId = req.body.llmKeyId as number | undefined;
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;

    if (!Array.isArray(steps)) {
      res.status(400).json({ error: req.t!("Steps array is required") });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: req.t!("Organization context is required") });
      return;
    }

    // Set SSE headers — disable buffering for real-time streaming.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "none");
    res.flushHeaders();

    // Helper: write one SSE event frame and flush if compression is active.
    const sendSSE = (event: StepStatusEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    };

    // Stop streaming if the client hangs up mid-plan.
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });

    for await (const event of executeCommandSteps(steps, {
      organizationId,
      userId: userId ?? 0,
      conversationId,
      llmKeyId,
      // Read steps run their tool directly; resolve from the advisor's registry.
      resolveToolExecutor: (toolName: string) => (availableTools as any)[toolName],
    })) {
      if (clientGone) {
        break;
      }
      sendSSE(event);
    }

    res.end();
    logStructured("successful", "Multi-step command execution completed", functionName, fileName);
  } catch (error) {
    logStructured("error", "Failed to execute multi-step command", functionName, fileName);
    logger.error("❌ Error executing multi-step command:", error);

    if (!res.headersSent) {
      res.status(500).json(STATUS_CODE[500](translateError(req, error)));
      return;
    }

    res.write(`data: ${JSON.stringify({ stepOrder: 0, status: "failed", error: (error as Error).message })}\n\n`);
    res.end();
  }
}
