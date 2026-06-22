/**
 * Phase 3 — Risk Agent
 *
 * Handles risk management, risk scoring, mitigation strategies,
 * risk aggregation across entities/projects/frameworks.
 */

import { createDomainAgent } from "./baseAgent";

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
    tools: [
      // Read tools
      "fetch_risks",
      "get_risk_by_id",
      "get_risk_analytics",
      "get_risk_history_timeseries",
      "get_risk_distribution",
      "fetch_risk_categories",
      "get_risk_summary",
      "get_risk_changes_history",
      "search_risks",
      "get_quantitative_risk_details",
      "get_risk_benchmarks",
      "fetch_model_risks",
      "get_model_risk_by_id",
      "get_model_risk_analytics",
      "get_model_risk_changes_history",
      // Write tools
      "agent_create_risk",
      "agent_update_risk",
      "agent_delete_risk",
      "agent_assign_risk_owner",
      "agent_change_risk_status",
      "agent_bulk_update_risk_status",
      "agent_link_risk_to_project",
      "agent_create_model_risk",
      "agent_suggest_model_risk",
      "agent_update_model_risk",
      "agent_delete_model_risk",
      "agent_change_model_risk_status",
    ],
    systemPromptSuffix: `You are a risk management expert. You understand risk scoring methodologies,
risk appetite frameworks, and mitigation strategies. When analyzing risks:
- Consider both inherent and residual risk levels
- Suggest specific mitigation actions with measurable impact
- Reference relevant compliance frameworks (EU AI Act, ISO 42001)
- Provide quantitative risk metrics when data is available
- Flag critical/high risks that need immediate attention`,
  });
}
