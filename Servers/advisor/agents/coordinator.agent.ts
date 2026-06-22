/**
 * Phase 3 — Coordinator Agent
 *
 * Main router that analyzes user messages, classifies intent,
 * delegates to specialized agents, and aggregates multi-agent results.
 */

import { classifyIntent, executeMultiAgent } from "../network/routingEngine";
import { getAgent, getAllAgents, registerAgent } from "../network/agentRegistry";
import type { RegisteredAgent } from "../network/agentRegistry";
import {
  createAgentRequest,
  createAgentResponse,
  type AgentRequest,
  type AgentResponse,
} from "../network/messageProtocol";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "coordinator.agent.ts";
const AGENT_NAME = "coordinator";

/**
 * Handle a user message through the coordinator.
 * Routes to specialized agents or handles directly.
 */
export async function coordinatorHandleMessage(
  message: string,
  organizationId: number,
  userId: number,
  sessionId?: string,
): Promise<{
  response: string;
  agentsUsed: string[];
  routing: { intent: string; isMultiAgent: boolean; confidence: number };
  totalTokens: number;
  duration: number;
}> {
  const functionName = "coordinatorHandleMessage";
  const startTime = Date.now();

  // 1. Classify intent
  const routing = classifyIntent(message);

  logStructured(
    "successful",
    `routing decision: ${routing.agents.join(", ")} (intent: ${routing.intent}, confidence: ${routing.confidence})`,
    functionName,
    fileName,
  );

  // 2. If coordinator should handle directly (no specialized agent matched)
  if (routing.agents.length === 1 && routing.agents[0] === AGENT_NAME) {
    return {
      response: "", // Empty — let the existing AI SDK flow handle it
      agentsUsed: [AGENT_NAME],
      routing: {
        intent: routing.intent,
        isMultiAgent: routing.isMultiAgent,
        confidence: routing.confidence,
      },
      totalTokens: 0,
      duration: Date.now() - startTime,
    };
  }

  // 3. Resolve agents
  const resolvedAgents: RegisteredAgent[] = [];
  for (const agentName of routing.agents) {
    const agent = getAgent(agentName);
    if (agent && agent.status.status !== "offline") {
      resolvedAgents.push(agent);
    }
  }

  // If no agents resolved, fall back to coordinator
  if (resolvedAgents.length === 0) {
    logStructured(
      "error",
      "no healthy agents found for routing, falling back",
      functionName,
      fileName,
    );
    return {
      response: "",
      agentsUsed: [AGENT_NAME],
      routing: {
        intent: routing.intent,
        isMultiAgent: false,
        confidence: 0.3,
      },
      totalTokens: 0,
      duration: Date.now() - startTime,
    };
  }

  // 4. Create request
  const request = createAgentRequest(
    AGENT_NAME,
    resolvedAgents[0].name,
    routing.intent,
    message,
    organizationId,
    userId,
    { sessionId },
  );

  // 5. Execute: single agent or multi-agent
  let responses: AgentResponse[];

  if (resolvedAgents.length === 1) {
    // Single agent
    try {
      const response = await resolvedAgents[0].handleMessage(request);
      responses = [response];
    } catch (error) {
      logStructured(
        "error",
        `agent ${resolvedAgents[0].name} failed: ${error}`,
        functionName,
        fileName,
      );
      return {
        response: "",
        agentsUsed: [AGENT_NAME],
        routing: { intent: routing.intent, isMultiAgent: false, confidence: routing.confidence },
        totalTokens: 0,
        duration: Date.now() - startTime,
      };
    }
  } else {
    // Multi-agent parallel execution
    responses = await executeMultiAgent(resolvedAgents, request);
  }

  // 6. Aggregate results
  const successResponses = responses.filter((r) => r.status === "success");

  if (successResponses.length === 0) {
    return {
      response: "",
      agentsUsed: [AGENT_NAME],
      routing: {
        intent: routing.intent,
        isMultiAgent: routing.isMultiAgent,
        confidence: routing.confidence,
      },
      totalTokens: 0,
      duration: Date.now() - startTime,
    };
  }

  // Merge multi-agent responses
  const mergedContent =
    successResponses.length === 1
      ? successResponses[0].result.content
      : successResponses.map((r) => `**${r.from}:**\n${r.result.content}`).join("\n\n---\n\n");

  const totalTokens = successResponses.reduce((sum, r) => sum + r.tokensUsed.total, 0);

  logStructured(
    "successful",
    `routed to ${resolvedAgents.map((a) => a.name).join(", ")} — ${totalTokens} tokens`,
    functionName,
    fileName,
  );

  return {
    response: mergedContent,
    agentsUsed: resolvedAgents.map((a) => a.name),
    routing: {
      intent: routing.intent,
      isMultiAgent: routing.isMultiAgent,
      confidence: routing.confidence,
    },
    totalTokens,
    duration: Date.now() - startTime,
  };
}

/**
 * Register the coordinator agent in the registry.
 */
export function registerCoordinatorAgent(): void {
  registerAgent({
    name: AGENT_NAME,
    description: "Main router agent that analyzes intent and delegates to specialized agents",
    capabilities: {
      name: AGENT_NAME,
      description: "Routes messages to specialized domain agents",
      tools: [],
      domains: ["general", "routing"],
      keywords: ["help", "what", "how", "explain", "summary", "overview"],
    },
    handleMessage: async (request: AgentRequest): Promise<AgentResponse> => {
      // Coordinator doesn't handle messages directly — it routes them
      return createAgentResponse(
        AGENT_NAME,
        request.from,
        request.correlationId,
        "Routing to appropriate agent...",
        { input: 0, output: 0, total: 0 },
        0,
      );
    },
    status: {
      name: AGENT_NAME,
      status: "healthy",
      lastHeartbeat: new Date().toISOString(),
      activeRequests: 0,
      totalProcessed: 0,
    },
  });
}
