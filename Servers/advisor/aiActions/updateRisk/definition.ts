/**
 * LLM-facing tool definition for `agent_update_risk`.
 *
 * Partial-update variant of `createRisk/definition.ts`. Every field
 * except `risk_id` is optional — the LLM sets only what it's changing.
 *
 * The description embeds the target-resolution protocol: if the user
 * didn't name a specific risk id, the LLM must call `fetch_risks` first,
 * pick the match, confirm with the user on ambiguity, and only then call
 * this tool.
 */

import type { AiActionToolDefinition } from "../types";

const AI_LIFECYCLE_PHASES = [
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
];

const RISK_CATEGORIES = [
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
];

const SEVERITIES = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
const LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const MITIGATION_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
];
const CURRENT_RISK_LEVELS = [
  "Very high risk",
  "High risk",
  "Medium risk",
  "Low risk",
  "Very Low risk",
];

export const updateRiskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_update_risk",
    description:
      "Propose updating fields on an existing risk. This is a WRITE action — it does NOT execute immediately. Instead, it files an approval request and returns a pending_approval status. A human Admin must approve before the update lands.\n\nUse this tool for ANY field change on a risk: status transitions (mitigation_status, approval_status), owner reassignment (risk_owner, approver), field updates (severity, likelihood, deadline, impact, descriptions), or project/framework linkage. There is NO separate tool for status changes or owner assignment — all of those are just this tool with different field sets.\n\nIMPORTANT — target resolution:\n1. If the user did NOT provide a specific risk id, call `fetch_risks` FIRST to find candidates matching their description. If exactly one matches, use its id. If multiple match, ask the user to pick by listing the candidates with names and ids. If none match, tell the user.\n2. Once you have the `risk_id`, include ONLY the fields the user actually wants to change. Do NOT include fields that aren't changing — the update is partial by design.\n3. For user-id fields (`risk_owner`, `approver`): if the user mentions a person by name, call `list_users` first to resolve the id.\n4. For `project_ids` / `framework_ids`: the array you provide REPLACES the existing set. To add to it, first fetch the current links (via `fetch_risks` which returns the risk) and send the combined set.\n5. Once you have the risk_id and at least one field to change, call this tool exactly once. Then tell the user what you filed and to check Pending Approvals.\n\nIf this tool returns a `validation_failed` error with 'At least one field besides risk_id must be provided', you forgot to include any updatable fields — ask the user what to change and retry.",
    parameters: {
      type: "object",
      properties: {
        risk_id: {
          type: "number",
          description:
            "The id of the risk to update. Required. Resolve via `fetch_risks` if the user didn't specify one.",
        },
        risk_name: {
          type: "string",
          description: "New risk name. Optional. 3–255 characters.",
        },
        risk_description: {
          type: "string",
          description: "New risk description. Optional. 1–256 characters.",
        },
        ai_lifecycle_phase: {
          type: "string",
          enum: AI_LIFECYCLE_PHASES,
          description: "New AI lifecycle phase. Optional.",
        },
        risk_category: {
          type: "array",
          items: { type: "string", enum: RISK_CATEGORIES },
          description:
            "Replacement risk category list. Optional. Replaces the existing categories entirely — if the user wants to add to them, include the existing plus the new.",
        },
        impact: {
          type: "string",
          description: "New impacted area. Optional. 1–256 characters.",
        },
        severity: {
          type: "string",
          enum: SEVERITIES,
          description:
            "New severity. Optional. Changing this (or likelihood) recomputes the risk level automatically.",
        },
        likelihood: {
          type: "string",
          enum: LIKELIHOODS,
          description:
            "New likelihood. Optional. Changing this (or severity) recomputes the risk level automatically.",
        },
        review_notes: {
          type: "string",
          description: "New review notes. Optional. Max 1024 characters.",
        },
        risk_owner: {
          type: "number",
          description:
            "New risk owner (user id). Optional. Resolve from `list_users` if the user mentions a name.",
        },
        project_ids: {
          type: "array",
          items: { type: "number" },
          description:
            "Replacement list of project ids. Optional. Replaces all existing project links for this risk.",
        },
        framework_ids: {
          type: "array",
          items: { type: "number" },
          description:
            "Replacement list of framework ids. Optional. Replaces all existing framework links for this risk.",
        },
        mitigation_status: {
          type: "string",
          enum: MITIGATION_STATUSES,
          description:
            "New mitigation status. Optional. This is the typical lifecycle driver — 'Not Started' → 'In Progress' → 'Completed', with side paths to 'On Hold', 'Deferred', 'Canceled'.",
        },
        mitigation_plan: {
          type: "string",
          description: "New mitigation plan. Optional. 1–1024 characters.",
        },
        current_risk_level: {
          type: "string",
          enum: CURRENT_RISK_LEVELS,
          description:
            "New assessed current risk level. Optional. This is the human-assessed value (not the auto-computed severity×likelihood level).",
        },
        implementation_strategy: {
          type: "string",
          description: "New implementation strategy. Optional. 1–1024 characters.",
        },
        deadline: {
          type: "string",
          description: "New mitigation deadline. Optional. ISO date string (YYYY-MM-DD).",
        },
        approver: {
          type: "number",
          description:
            "New approver (user id). Optional. Resolve from `list_users` if the user mentions a name.",
        },
        approval_status: {
          type: "string",
          enum: MITIGATION_STATUSES,
          description: "New approval workflow status. Optional.",
        },
        date_of_assessment: {
          type: "string",
          description: "New assessment date. Optional. ISO date string (YYYY-MM-DD).",
        },
      },
      required: ["risk_id"],
    },
  },
};
