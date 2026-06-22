/**
 * Phase 3 — Policy Agent
 *
 * Handles policy lifecycle, review workflows,
 * regulatory mapping, and policy-control traceability.
 */

import { createDomainAgent } from "./baseAgent";

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
    tools: [
      // Read tools
      "fetch_policies",
      "get_policy_by_id",
      "get_policy_analytics",
      "get_policy_changes_history",
      "search_policies",
      "get_policy_review_status",
      "get_policy_compliance_mapping",
      "fetch_policy_linked_objects",
      "get_policy_linked_object_by_id",
      // Write tools
      "agent_create_policy",
      "agent_update_policy",
      "agent_delete_policy",
      "agent_submit_policy_for_review",
      "agent_approve_policy_review",
      "agent_link_policy_to_object",
      "agent_unlink_policy_from_object",
    ],
    systemPromptSuffix: `You are a policy management expert. When working with policies:
- Understand the full policy lifecycle (draft → review → approved → published)
- Track policy versions and highlight changes between versions
- Map policies to relevant controls and frameworks
- Flag policies due for review or overdue
- Suggest policy improvements based on regulatory requirements`,
  });
}
