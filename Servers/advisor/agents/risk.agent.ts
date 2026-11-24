/**
 * Phase 3 — Risk Agent
 *
 * Handles risk management, risk scoring, mitigation strategies,
 * risk aggregation across entities/projects/frameworks.
 */

import { createDomainAgent } from "./baseAgent";
import { getAgentToolNames } from "./agentToolMap";

export function registerRiskAgent() {
  return createDomainAgent({
    name: "risk-agent",
    description:
      "Risk management specialist — risk scoring, mitigation, aggregation, and heat map analysis",
    domains: ["risk", "model_risk"],
    keywords: [
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
      "risk appetite",
      "residual risk",
      "inherent risk",
      "risk treatment",
      "risk register",
      "quantitative risk",
      "risk benchmark",
    ],
    tools: getAgentToolNames("risk-agent"),
    systemPromptSuffix: `You are a risk management expert. You understand risk scoring methodologies,
risk appetite frameworks, and mitigation strategies. When analyzing risks:
- Consider both inherent and residual risk levels
- Suggest specific mitigation actions with measurable impact
- Reference relevant compliance frameworks (EU AI Act, ISO 42001)
- Provide quantitative risk metrics when data is available
- Flag critical/high risks that need immediate attention`,
  });
}
