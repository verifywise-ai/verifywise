/**
 * Phase 3 — Vendor Agent
 *
 * Handles vendor management, third-party risk assessment,
 * SLA tracking, and vendor due diligence.
 */

import { createDomainAgent } from "./baseAgent";
import { getAgentToolNames } from "./agentToolMap";

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
    tools: getAgentToolNames("vendor-agent"),
    systemPromptSuffix: `You are a vendor management and third-party risk expert. When assessing vendors:
- Evaluate data processing agreements and SLAs
- Consider supply chain risk and concentration risk
- Flag vendors with expired reviews or high risk scores
- Recommend risk mitigation steps for critical vendors
- Track vendor compliance with relevant frameworks`,
  });
}
