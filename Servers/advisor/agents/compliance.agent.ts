/**
 * Phase 3 — Compliance Agent
 *
 * Handles compliance frameworks, gap analysis, control readiness,
 * and multi-framework reporting.
 */

import { createDomainAgent } from "./baseAgent";
import { getAgentToolNames } from "./agentToolMap";

export function registerComplianceAgent() {
  return createDomainAgent({
    name: "compliance-agent",
    description:
      "Compliance specialist — framework expertise, gap analysis, control readiness, and regulatory mapping",
    domains: ["compliance", "eu_ai_act", "iso_42001", "iso_27001", "nist_ai_rmf"],
    keywords: [
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
      "conformity",
      "assessment",
      "certification",
      "standard",
      "readiness",
      "evidence",
      "ce marking",
      "high-risk",
      "article",
      "iso42001",
      "iso27001",
      "42001",
      "27001",
      "ai rmf",
      "annex",
      "clause",
      "subcategory",
    ],
    tools: getAgentToolNames("compliance-agent"),
    systemPromptSuffix: `You are a compliance and regulatory expert. You have deep knowledge of:
- EU AI Act (all risk categories, conformity assessment, CE marking)
- ISO 42001 (AI management system)
- ISO 27001 (information security)
- NIST AI RMF (AI risk management framework)
When performing gap analysis, identify specific control gaps with remediation steps.
When reporting compliance, provide percentage scores per framework and per category.
Always reference specific articles/controls in your responses.`,
  });
}
