/**
 * Agent → tool mapping (single source of truth for tool subsetting).
 *
 * Why a static config rather than the agent registries?
 *   - `network/agentRegistry.ts` (RegisteredAgent) and `agents/agentRegistry.ts`
 *     (AgentDefinition) are filled at boot by bootstrapAgentNetwork()
 *     (network/agentNetwork.ts, called from index.ts), but the router runs
 *     per request and only needs names and keywords, so it reads this plain
 *     config instead of depending on registry state.
 *
 * This file holds each agent's keywords and tool names so the router can
 * answer "given this user message, which tool names should the LLM see?".
 * The domain agents in `*.agent.ts` read their tool lists from here
 * (getAgentToolNames).
 *
 * RULE OF THUMB when editing:
 *   - Tool names listed here MUST be the same names registered in the
 *     master `availableTools` map / `toolsDefinition` array (advisor.ctrl.ts).
 *     `__tests__/agentToolMap.names.test.ts` fails on any name that isn't.
 *   - Any tool NOT listed in any agent here becomes a "universal" tool —
 *     always available regardless of routing. New tools default to
 *     universal, which is the safe behaviour.
 *   - Claiming a tool hides it whenever another agent is matched instead.
 *     Leave read, lookup and catalogue tools unclaimed unless they only make
 *     sense in this agent's domain, and claim a write tool only when every
 *     lookup it needs stays reachable when this agent matches (unclaimed or
 *     claimed by this agent too).
 *   - The embedding matcher describes an agent with its first
 *     CAPABILITY_HINT_LIMIT tool names, so keep each list within it, most
 *     descriptive tools first.
 */

import { logStructured } from "../../utils/logger/fileLogger";

/** How many tool names the embedding matcher puts in an agent's description. */
export const CAPABILITY_HINT_LIMIT = 25;

export interface AgentToolEntry {
  name: string;
  /** Lowercase keywords matched against the user message (case-insensitive). */
  keywords: string[];
  /** Tool names this agent claims. Must match availableTools / toolsDefinition. */
  tools: string[];
}

export const AGENT_TOOL_MAP: AgentToolEntry[] = [
  {
    name: "risk-agent",
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
      "fetch_risks",
      "get_risk_analytics",
      "get_risk_history_timeseries",
      "fetch_model_risks",
      "get_model_risk_analytics",
      "agent_create_risk",
      "agent_update_risk",
      "agent_delete_risk",
      "agent_assign_risk_owner",
      "agent_change_risk_status",
      "agent_bulk_update_risk_status",
      "agent_link_risk_to_project",
      "agent_create_model_risk",
      "agent_update_model_risk",
      "agent_delete_model_risk",
      "agent_change_model_risk_status",
      "agent_restore_model_risk",
      "agent_attach_model_risk_to_model",
      "agent_detach_model_risk_from_model",
    ],
  },
  {
    name: "vendor-agent",
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
      "fetch_vendors",
      "get_vendor_analytics",
      "fetch_vendor_risks",
      "agent_create_vendor",
      "agent_update_vendor",
      "agent_delete_vendor",
      "agent_create_vendor_risk",
      "agent_update_vendor_risk",
      "agent_delete_vendor_risk",
      "agent_flag_vendor_for_review",
    ],
  },
  {
    name: "compliance-agent",
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
    tools: [
      "get_compliance_score",
      "get_iso42001_progress",
      "get_iso27001_progress",
      "get_ce_marking_status",
      "agent_save_eu_ai_act_control",
      "agent_save_eu_ai_act_assessment_answer",
      "agent_save_iso42001_clauses",
      "agent_save_iso42001_annexes",
      "agent_save_iso27001_clauses",
      "agent_save_iso27001_annexes",
      "agent_update_nist_subcategory",
      "agent_update_ce_marking",
      "agent_create_evidence",
      "agent_update_evidence",
      "agent_delete_evidence",
    ],
  },
  {
    name: "incident-agent",
    keywords: [
      "incident",
      "breach",
      "security event",
      "root cause",
      "remediation",
      "post-mortem",
      "outage",
      "data breach",
      "security incident",
      "incident response",
      "containment",
      "recovery",
      "lessons learned",
    ],
    tools: [
      "fetch_incidents",
      "get_incident_analytics",
      "agent_create_incident",
      "agent_update_incident",
      "agent_delete_incident",
      "agent_archive_incident",
      "agent_update_incident_status",
    ],
  },
  {
    name: "model-agent",
    keywords: [
      "model",
      "model inventory",
      "ai model",
      "machine learning",
      "deployment",
      "model risk",
      "dataset",
      "training data",
      "foundation model",
      "model lifecycle",
      "model card",
      "bias",
      "fairness",
      "accuracy",
      "model validation",
      "model monitoring",
      "model lineage",
    ],
    tools: [
      "get_model_inventory_analytics",
      "fetch_datasets",
      "get_dataset_analytics",
      "fetch_model_risks",
      "get_model_risk_analytics",
      "agent_register_model",
      "agent_update_model",
      "agent_retire_model",
      "agent_delete_model",
      "agent_link_model_to_project",
      "agent_register_dataset",
      "agent_update_dataset",
      "agent_delete_dataset",
      "agent_link_dataset_to_model",
      "agent_link_model_to_dataset",
      "agent_unlink_model_from_dataset",
      "agent_create_model_risk",
      "agent_attach_model_risk_to_model",
      "agent_detach_model_risk_from_model",
    ],
  },
  {
    name: "policy-agent",
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
      "fetch_policies",
      "get_policy_analytics",
      "get_policy_review_status",
      "agent_create_policy",
      "agent_update_policy",
      "agent_delete_policy",
      "agent_submit_policy_for_review",
      "agent_approve_policy_review",
    ],
  },
  {
    name: "evidence-agent",
    keywords: [
      "evidence",
      "document",
      "upload",
      "file",
      "attachment",
      "supporting",
      "proof",
      "screenshot",
      "pdf",
      "evidence quality",
      "evidence gap",
      "control link",
    ],
    tools: ["analyze_document", "score_evidence_quality", "match_controls", "detect_evidence_gaps"],
  },
  {
    name: "control-assessment-agent",
    keywords: [
      "readiness",
      "audit ready",
      "audit-ready",
      "control assessment",
      "control score",
      "evaluate control",
      "improvement recommendation",
      "weakest controls",
      "control health",
    ],
    tools: [
      "evaluate_evidence",
      "check_task_completion",
      "analyze_risk_status",
      "generate_recommendations",
    ],
  },
  {
    name: "task-agent",
    keywords: [
      "task",
      "todo",
      "to-do",
      "action item",
      "deadline",
      "overdue",
      "assignment",
      "due date",
      "task assignment",
    ],
    // Tasks aren't claimed by the original 10 agents; we add them here so
    // task-related queries don't lose the task tools to "universal".
    tools: [
      "fetch_tasks",
      "get_task_analytics",
      "agent_create_task",
      "agent_update_task",
      "agent_delete_task",
      "agent_assign_task",
    ],
  },
  {
    name: "training-agent",
    keywords: [
      "training",
      "course",
      "education",
      "learning",
      "certificate",
      "completion rate",
      "learner",
      "syllabus",
    ],
    tools: [
      "fetch_training_records",
      "get_training_analytics",
      "get_training_executive_summary",
      "agent_create_training_record",
      "agent_update_training_record",
      "agent_assign_training_to_user",
      "agent_delete_training_record",
    ],
  },
];

/**
 * Tool names an agent claims, for the agent definitions in `*.agent.ts`, so
 * they register the same list the router uses instead of keeping a copy.
 * Called at boot: an unknown name logs an error and returns no tools rather
 * than stopping the server (the bootstrap test fails on it instead).
 */
export function getAgentToolNames(agentName: string): string[] {
  const entry = AGENT_TOOL_MAP.find((agent) => agent.name === agentName);
  if (!entry) {
    logStructured(
      "error",
      `no AGENT_TOOL_MAP entry for ${agentName}; registering it without tools`,
      "getAgentToolNames",
      "agentToolMap.ts",
    );
    return [];
  }
  return [...entry.tools];
}
