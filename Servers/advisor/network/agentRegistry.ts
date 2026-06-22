/**
 * Phase 3 — Agent Registry
 *
 * Dynamic registry for managing specialized agents.
 * Supports registration, discovery, health checks, and capability queries.
 */

import type { AgentCapability, AgentStatus, AgentRequest, AgentResponse } from "./messageProtocol";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "agentRegistry.ts";

export interface RegisteredAgent {
  name: string;
  description: string;
  capabilities: AgentCapability;
  handleMessage: (request: AgentRequest) => Promise<AgentResponse>;
  status: AgentStatus;
}

const registry = new Map<string, RegisteredAgent>();

/**
 * Register an agent in the registry.
 */
export function registerAgent(agent: RegisteredAgent): void {
  registry.set(agent.name, agent);
  logStructured(
    "successful",
    `registered agent: ${agent.name} (${agent.capabilities.tools.length} tools, domains: ${agent.capabilities.domains.join(", ")})`,
    "registerAgent",
    fileName,
  );
}

/**
 * Unregister an agent.
 */
export function unregisterAgent(name: string): boolean {
  const removed = registry.delete(name);
  if (removed) {
    logStructured("successful", `unregistered agent: ${name}`, "unregisterAgent", fileName);
  }
  return removed;
}

/**
 * Get a registered agent by name.
 */
export function getAgent(name: string): RegisteredAgent | undefined {
  return registry.get(name);
}

/**
 * Get all registered agents.
 */
export function getAllAgents(): RegisteredAgent[] {
  return Array.from(registry.values());
}

/**
 * Get all healthy agents.
 */
export function getHealthyAgents(): RegisteredAgent[] {
  return getAllAgents().filter((a) => a.status.status === "healthy");
}

/**
 * Find agents that can handle a specific domain.
 */
export function findAgentsByDomain(domain: string): RegisteredAgent[] {
  return getAllAgents().filter((a) =>
    a.capabilities.domains.some((d) => d.toLowerCase() === domain.toLowerCase()),
  );
}

/**
 * Find agents matching keywords from a user message.
 */
export function findAgentsByKeywords(message: string): RegisteredAgent[] {
  const lowerMessage = message.toLowerCase();
  return getAllAgents()
    .filter((a) => a.capabilities.keywords.some((kw) => lowerMessage.includes(kw.toLowerCase())))
    .sort((a, b) => {
      // Score by number of matching keywords
      const scoreA = a.capabilities.keywords.filter((kw) =>
        lowerMessage.includes(kw.toLowerCase()),
      ).length;
      const scoreB = b.capabilities.keywords.filter((kw) =>
        lowerMessage.includes(kw.toLowerCase()),
      ).length;
      return scoreB - scoreA;
    });
}

/**
 * Get agent status summary.
 */
export function getRegistryStatus(): {
  totalAgents: number;
  healthyAgents: number;
  agents: AgentStatus[];
} {
  const agents = getAllAgents();
  return {
    totalAgents: agents.length,
    healthyAgents: agents.filter((a) => a.status.status === "healthy").length,
    agents: agents.map((a) => a.status),
  };
}

/**
 * Update agent heartbeat.
 */
export function updateAgentHeartbeat(name: string): void {
  const agent = registry.get(name);
  if (agent) {
    agent.status.lastHeartbeat = new Date().toISOString();
  }
}
