/**
 * Phase 3 — Base Agent Factory
 *
 * Creates specialized agents with domain-specific tools and system prompts.
 * Each agent flows write operations through the Approval Gateway.
 */

import { registerAgent, type RegisteredAgent } from "../network/agentRegistry";
import type { AgentRequest, AgentResponse, AgentCapability } from "../network/messageProtocol";
import { createAgentResponse } from "../network/messageProtocol";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "baseAgent.ts";

export interface AgentConfig {
  name: string;
  description: string;
  domains: string[];
  keywords: string[];
  tools: string[];
  systemPromptSuffix: string;
}

/**
 * Create and register a specialized domain agent.
 */
export function createDomainAgent(config: AgentConfig): RegisteredAgent {
  const capability: AgentCapability = {
    name: config.name,
    description: config.description,
    tools: config.tools,
    domains: config.domains,
    keywords: config.keywords,
  };

  const agent: RegisteredAgent = {
    name: config.name,
    description: config.description,
    capabilities: capability,
    handleMessage: async (request: AgentRequest): Promise<AgentResponse> => {
      const startTime = Date.now();

      try {
        // The actual LLM call happens through the existing AI SDK pipeline.
        // This agent provides routing metadata — the coordinator uses it
        // to select the right tool subset and system prompt for the LLM call.
        const response = createAgentResponse(
          config.name,
          request.from,
          request.correlationId,
          `[${config.name}] Processing: ${request.payload.message}`,
          { input: 0, output: 0, total: 0 },
          Date.now() - startTime,
        );

        agent.status.totalProcessed++;
        agent.status.lastHeartbeat = new Date().toISOString();

        return response;
      } catch (error) {
        logStructured("error", `agent ${config.name} failed: ${error}`, "handleMessage", fileName);
        return createAgentResponse(
          config.name,
          request.from,
          request.correlationId,
          `Error in ${config.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
          { input: 0, output: 0, total: 0 },
          Date.now() - startTime,
          "error",
        );
      }
    },
    status: {
      name: config.name,
      status: "healthy",
      lastHeartbeat: new Date().toISOString(),
      activeRequests: 0,
      totalProcessed: 0,
    },
  };

  registerAgent(agent);
  return agent;
}

/**
 * Get the tool subset for a specific agent.
 * Used by the AI SDK pipeline to filter available tools per agent.
 */
export function getAgentToolFilter(agentName: string): string[] | null {
  const { getAgent } = require("../network/agentRegistry");
  const agent = getAgent(agentName);
  if (!agent) return null;
  return agent.capabilities.tools;
}
