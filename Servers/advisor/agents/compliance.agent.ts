/**
 * Phase 3 — Compliance Agent
 *
 * Handles compliance frameworks, gap analysis, control readiness,
 * and multi-framework reporting.
 */

import { createDomainAgent } from "./baseAgent";

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
    ],
    tools: [
      // Read tools
      "get_compliance_overview",
      "get_compliance_score",
      "get_compliance_gaps",
      "get_framework_progress",
      "get_control_readiness",
      "get_control_readiness_detail",
      "fetch_eu_ai_act_categories",
      "get_eu_ai_act_progress",
      "fetch_iso42001_categories",
      "get_iso42001_progress",
      "fetch_iso27001_categories",
      "get_iso27001_progress",
      "fetch_nist_ai_rmf_categories",
      "get_nist_ai_rmf_progress",
      "get_evidence_analysis",
      "get_control_readiness_analysis",
      "get_ce_marking_status",
      "fetch_audit_ledger_entries",
      "get_audit_ledger_stats",
      // Write tools
      "agent_update_eu_ai_act_assessment",
      "agent_submit_eu_ai_act_evidence",
      "agent_update_iso42001_assessment",
      "agent_submit_iso42001_evidence",
      "agent_update_iso27001_assessment",
      "agent_submit_iso27001_evidence",
      "agent_update_nist_ai_rmf_assessment",
      "agent_update_ce_marking_status",
      "agent_create_evidence",
      "agent_update_evidence",
      "agent_delete_evidence",
    ],
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
