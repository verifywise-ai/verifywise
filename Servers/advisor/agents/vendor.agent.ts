/**
 * Phase 3 — Vendor Agent
 *
 * Handles vendor management, third-party risk assessment,
 * SLA tracking, and vendor due diligence.
 */

import { createDomainAgent } from "./baseAgent";

export function registerVendorAgent() {
  return createDomainAgent({
    name: "vendor-agent",
    description: "Vendor management specialist — third-party risk, SLA tracking, due diligence",
    domains: ["vendor"],
    keywords: [
      "vendor",
      "supplier",
      "third-party",
      "third party",
      "due diligence",
      "sla",
      "contract",
      "vendor risk",
      "subprocessor",
      "outsourcing",
      "vendor assessment",
      "vendor review",
      "procurement",
    ],
    tools: [
      // Read tools
      "fetch_vendors",
      "get_vendor_by_id",
      "get_vendor_analytics",
      "fetch_vendor_risks",
      "get_vendor_risk_by_id",
      "get_vendor_risk_analytics",
      "get_vendor_changes_history",
      "search_vendors",
      "get_vendor_risk_changes_history",
      "get_vendor_compliance_status",
      "get_vendor_review_schedule",
      "get_vendor_risk_summary",
      // Write tools
      "agent_create_vendor",
      "agent_update_vendor",
      "agent_delete_vendor",
      "agent_create_vendor_risk",
      "agent_update_vendor_risk",
      "agent_delete_vendor_risk",
      "agent_flag_vendor_for_review",
    ],
    systemPromptSuffix: `You are a vendor management and third-party risk expert. When assessing vendors:
- Evaluate data processing agreements and SLAs
- Consider supply chain risk and concentration risk
- Flag vendors with expired reviews or high risk scores
- Recommend risk mitigation steps for critical vendors
- Track vendor compliance with relevant frameworks`,
  });
}
