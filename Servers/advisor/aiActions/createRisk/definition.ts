/**
 * LLM-facing tool definition for `agent_create_risk`.
 *
 * Mirrors `./schema.ts` (the strict Zod schema). The two are kept in sync
 * by hand because they serve different consumers (LLM vs TS runtime) and
 * the shapes don't round-trip cleanly.
 *
 * Required fields here match the UI's AddNewRiskForm. The LLM is told to
 * NOT call this tool until every required field is filled — see the
 * description below and the "AI write tools" carve-out in
 * `Servers/advisor/prompts.ts` for the asking-for-missing-info workflow.
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

export const createRiskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_create_risk",
    description:
      "Propose creating a new project risk. This is a WRITE action — it does NOT execute immediately. Instead, it files an approval request and returns a pending_approval status. A human Admin must approve before the risk is actually created.\n\nIMPORTANT — collecting required fields:\n1. Use this tool ONLY when the user explicitly asks to create, add, or log a new risk.\n2. Parse the user's first prompt for every required field listed below. Do NOT invent or default values you cannot derive from what the user actually said.\n3. If ANY required field is missing after parsing the first prompt, do NOT call this tool. Instead, send ONE message listing every missing field and asking the user to provide them all in their next reply. Group related fields together for clarity.\n4. For user-id fields (`approver`, `risk_owner`): if the user mentions a person by name or email, call `list_users` first to resolve the id, then include the numeric id here. If the user did not mention anyone, ask them in the same batch as the other missing fields.\n5. Once you have ALL required fields, call this tool exactly once. Then tell the user to open Pending Approvals to approve or reject.\n\nIf this tool returns a validation_failed error, read the error messages, ask the user for the specific values that failed, and retry — do not loop.",
    parameters: {
      type: "object",
      properties: {
        // Tab 1 — Risk
        risk_name: {
          type: "string",
          description:
            "Short, specific name for the risk (e.g., 'Model drift on Q2 pricing engine'). Required. 3–255 characters.",
        },
        risk_description: {
          type: "string",
          description:
            "What could go wrong, why it matters, and any relevant context. Required. 1–256 characters.",
        },
        ai_lifecycle_phase: {
          type: "string",
          enum: AI_LIFECYCLE_PHASES,
          description:
            "Which phase of the AI lifecycle the risk sits in. Required.",
        },
        risk_category: {
          type: "array",
          items: { type: "string", enum: RISK_CATEGORIES },
          description:
            "One or more risk categories. Required — at least one. Pick from the allowed enum values exactly.",
        },
        impact: {
          type: "string",
          description:
            "Short phrase describing the impacted area or stakeholders (e.g., 'end users', 'financial reporting'). Required. 1–256 characters.",
        },
        severity: {
          type: "string",
          enum: SEVERITIES,
          description:
            "Impact severity if the risk materializes. Optional — only set if the user gave a clear hint. Catastrophic is highest, Negligible is lowest.",
        },
        likelihood: {
          type: "string",
          enum: LIKELIHOODS,
          description:
            "How likely the risk is to occur. Optional — only set if the user gave a clear hint. Almost Certain is highest, Rare is lowest.",
        },
        review_notes: {
          type: "string",
          description: "Optional review notes. Max 1024 characters.",
        },
        risk_owner: {
          type: "number",
          description:
            "Optional user id of the action owner. Resolve from `list_users` if the user mentions a name. If the user did not mention an owner, omit this field.",
        },
        project_ids: {
          type: "array",
          items: { type: "number" },
          description:
            "Optional ids of projects this risk should be associated with.",
        },
        framework_ids: {
          type: "array",
          items: { type: "number" },
          description:
            "Optional ids of compliance frameworks this risk maps to.",
        },

        // Tab 2 — Mitigation
        mitigation_status: {
          type: "string",
          enum: MITIGATION_STATUSES,
          description:
            "Current state of any mitigation work for this risk. Required.",
        },
        mitigation_plan: {
          type: "string",
          description:
            "How the risk will be mitigated. Required. 1–1024 characters.",
        },
        current_risk_level: {
          type: "string",
          enum: CURRENT_RISK_LEVELS,
          description:
            "Current overall risk level after considering mitigation efforts to date. Required.",
        },
        implementation_strategy: {
          type: "string",
          description:
            "Concrete steps the team will take to execute the mitigation plan. Required. 1–1024 characters.",
        },
        deadline: {
          type: "string",
          description:
            "Target completion date for the mitigation. Required. ISO date string (YYYY-MM-DD).",
        },
        approver: {
          type: "number",
          description:
            "User id of the person who approves the mitigation. Required. Resolve from `list_users` if the user mentions a name — do not guess.",
        },
        approval_status: {
          type: "string",
          enum: MITIGATION_STATUSES,
          description:
            "Status of the approval workflow for this risk's mitigation. Required.",
        },
        date_of_assessment: {
          type: "string",
          description:
            "When the risk was assessed. Required. ISO date string (YYYY-MM-DD).",
        },
      },
      required: [
        "risk_name",
        "risk_description",
        "ai_lifecycle_phase",
        "risk_category",
        "impact",
        "mitigation_status",
        "mitigation_plan",
        "current_risk_level",
        "implementation_strategy",
        "deadline",
        "approver",
        "approval_status",
        "date_of_assessment",
      ],
    },
  },
};
