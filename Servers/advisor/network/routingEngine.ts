/**
 * Phase 3 — Routing Engine
 *
 * Intent classification and multi-agent routing.
 * Maps user messages to one or more specialized agents.
 */

import { findAgentsByKeywords, findAgentsByDomain, getAgent } from "./agentRegistry";
import type { RegisteredAgent } from "./agentRegistry";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "routingEngine.ts";

export interface RoutingDecision {
  agents: string[];
  intent: string;
  isMultiAgent: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Domain keyword mappings for intent classification.
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  risk: [
    "risk",
    "threat",
    "vulnerability",
    "likelihood",
    "severity",
    "mitigation",
    "risk score",
    "risk matrix",
    "heat map",
    "risk owner",
  ],
  compliance: [
    "compliance",
    "framework",
    "eu ai act",
    "iso 42001",
    "iso 27001",
    "nist",
    "control",
    "audit",
    "gap analysis",
    "regulation",
    "requirement",
  ],
  vendor: [
    "vendor",
    "supplier",
    "third-party",
    "third party",
    "vendor risk",
    "due diligence",
    "sla",
    "contract",
  ],
  policy: [
    "policy",
    "policies",
    "procedure",
    "regulation",
    "governance",
    "review workflow",
    "policy template",
  ],
  incident: [
    "incident",
    "breach",
    "security event",
    "root cause",
    "remediation",
    "post-mortem",
    "outage",
  ],
  model: [
    "model",
    "model inventory",
    "ai model",
    "machine learning",
    "deployment",
    "model risk",
    "dataset",
    "training data",
    "foundation model",
  ],
};

/**
 * Classify user intent and determine which agents should handle it.
 */
export function classifyIntent(message: string): RoutingDecision {
  const functionName = "classifyIntent";
  const lowerMessage = message.toLowerCase();

  // Score each domain
  const domainScores: Record<string, number> = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter((kw) => lowerMessage.includes(kw)).length;
    if (score > 0) {
      domainScores[domain] = score;
    }
  }

  // Find agents by keyword matching
  const matchedAgents = findAgentsByKeywords(message);

  // If no domain matched, this is a general query
  if (Object.keys(domainScores).length === 0 && matchedAgents.length === 0) {
    return {
      agents: ["coordinator"],
      intent: "general",
      isMultiAgent: false,
      confidence: 0.5,
      reasoning: "No domain-specific keywords found, coordinator handles directly",
    };
  }

  // Sort domains by score
  const sortedDomains = Object.entries(domainScores).sort(([, a], [, b]) => b - a);

  // Single domain match
  if (sortedDomains.length === 1) {
    const [domain, score] = sortedDomains[0];
    const agents = findAgentsByDomain(domain);
    if (agents.length > 0) {
      return {
        agents: agents.map((a) => a.name),
        intent: domain,
        isMultiAgent: false,
        confidence: Math.min(score / 3, 1.0),
        reasoning: `Single domain match: ${domain} (score: ${score})`,
      };
    }
  }

  // Multi-domain match → multi-agent routing
  if (sortedDomains.length > 1) {
    const targetAgents: string[] = [];
    for (const [domain] of sortedDomains) {
      const agents = findAgentsByDomain(domain);
      for (const agent of agents) {
        if (!targetAgents.includes(agent.name)) {
          targetAgents.push(agent.name);
        }
      }
    }

    if (targetAgents.length > 0) {
      logStructured(
        "successful",
        `multi-agent routing: ${targetAgents.join(", ")} for domains: ${sortedDomains.map(([d]) => d).join(", ")}`,
        functionName,
        fileName,
      );
      return {
        agents: targetAgents,
        intent: sortedDomains.map(([d]) => d).join("+"),
        isMultiAgent: targetAgents.length > 1,
        confidence: 0.8,
        reasoning: `Multi-domain match: ${sortedDomains.map(([d, s]) => `${d}(${s})`).join(", ")}`,
      };
    }
  }

  // Fallback: use keyword-matched agents
  if (matchedAgents.length > 0) {
    return {
      agents: matchedAgents.map((a) => a.name),
      intent: "keyword_match",
      isMultiAgent: matchedAgents.length > 1,
      confidence: 0.6,
      reasoning: `Keyword match: ${matchedAgents.map((a) => a.name).join(", ")}`,
    };
  }

  // Final fallback: coordinator handles it
  return {
    agents: ["coordinator"],
    intent: "general",
    isMultiAgent: false,
    confidence: 0.3,
    reasoning: "No agent matched, coordinator handles directly",
  };
}

/**
 * Execute multi-agent routing: run agents in parallel and merge results.
 */
export async function executeMultiAgent(
  agents: RegisteredAgent[],
  request: import("./messageProtocol").AgentRequest,
): Promise<import("./messageProtocol").AgentResponse[]> {
  const promises = agents.map(async (agent) => {
    try {
      const agentRequest = { ...request, to: agent.name };
      return await agent.handleMessage(agentRequest);
    } catch (error) {
      return {
        from: agent.name,
        to: request.from,
        correlationId: request.correlationId,
        result: {
          content: `Agent ${agent.name} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          confidence: 0,
        },
        tokensUsed: { input: 0, output: 0, total: 0 },
        duration: 0,
        status: "error" as const,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  return Promise.all(promises);
}
