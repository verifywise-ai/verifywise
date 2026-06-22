import type { ToolSet } from "ai";

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolSet;
  maxSteps: number;
}

const registry = new Map<string, AgentDefinition>();

export function registerAgent(agent: AgentDefinition): void {
  registry.set(agent.name, agent);
}

export function getAgent(name: string): AgentDefinition | undefined {
  return registry.get(name);
}

export function listAgents(): AgentDefinition[] {
  return Array.from(registry.values());
}
