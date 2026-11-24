/**
 * Phase 3 — Policy Agent
 *
 * Handles policy lifecycle, review workflows,
 * regulatory mapping, and policy-control traceability.
 */

import { createDomainAgent } from "./baseAgent";
import { getAgentToolNames } from "./agentToolMap";

export function registerPolicyAgent() {
  return createDomainAgent({
    name: "policy-agent",
    description:
      "Policy management specialist — policy lifecycle, review workflows, regulatory mapping",
    domains: ["policy"],
    keywords: [
      "policy",
      "policies",
      "procedure",
      "governance",
      "review",
      "policy template",
      "policy version",
      "policy approval",
      "regulatory",
      "guideline",
      "standard operating procedure",
    ],
    tools: getAgentToolNames("policy-agent"),
    systemPromptSuffix: `You are a policy management expert. When working with policies:
- Understand the full policy lifecycle (draft → review → approved → published)
- A policy goes under review only by submitting it for approval, and is approved only by its approval workflow's approvers or, when the organization has no policy approval workflow, by an Admin directly
- Track policy versions and highlight changes between versions
- Map policies to relevant controls and frameworks
- Flag policies due for review or overdue
- Suggest policy improvements based on regulatory requirements`,
  });
}
