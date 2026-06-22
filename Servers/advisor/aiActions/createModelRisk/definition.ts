/**
 * LLM-facing tool definition for `agent_create_model_risk` — the
 * user-driven path that files into the dedicated Pending Approvals page.
 *
 * For the AI auto-suggest flow (after suggest_risks_for_model returns
 * guidance), the LLM should use `agent_suggest_model_risk` instead,
 * which produces inline chat-card approvals.
 */

import type { AiActionToolDefinition } from "../types";

const RISK_CATEGORIES = [
  "Performance",
  "Bias & Fairness",
  "Security",
  "Data Quality",
  "Compliance",
];
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];
const RISK_STATUSES = ["Open", "In Progress", "Resolved", "Accepted"];

export const createModelRiskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_create_model_risk",
    description:
      "Propose creating a new MODEL-specific risk attached to an AI model (or unattached for later linking). Use this WHEN THE USER EXPLICITLY ASKS to create a model risk (e.g. 'add a model risk for X', 'log a security risk on the GPT-4 model', or supplies a concrete risk_name + any of description/risk_category/risk_level/owner/target_date/mitigation_plan/impact/likelihood alongside a model). This is a WRITE action — it does NOT execute immediately. Instead, it files an approval request that appears in the dedicated Pending Approvals page (a human Admin must approve before the risk is actually created).\n\nSAME-TURN-AS-MODEL-CREATION USAGE (CRITICAL): If the user asks for both a model AND an explicit risk in the same message (e.g. 'create model X with risk Y' or 'register model X and a risk for it with risk_name=...'), you MUST call this tool in the SAME TURN as agent_register_model. Pass pending_model_approval_id=<approvalRequestId returned by agent_register_model> and OMIT model_id. This is the dedicated mechanism for same-turn parent+child filing — DO NOT defer the risk to a later turn, and DO NOT skip this tool. The suggested-risk inline cards from agent_suggest_model_risk are NOT a substitute for the user's explicit risk — that risk has user-supplied parameters and must route to Pending Approvals via THIS tool.\n\nIMPORTANT: Do NOT use this tool when the suggest_risks_for_model flow asks you to file generated/suggested risks — for that flow use agent_suggest_model_risk (which creates inline chat-card approvals). Use THIS tool only for risks the USER explicitly described.\n\nIMPORTANT — collecting required fields:\n1. Use this tool when the user explicitly asks to create, add, or log a new model risk OR supplies explicit risk parameters alongside a model.\n2. Parse the user's prompt for every field below. Do NOT invent values the user did not give.\n3. For owner: if the user mentions a person by name, call list_users first to resolve the numeric id. Do NOT pass a name string.\n4. For model_id: resolve via fetch_model_inventories if the user mentions a model name. Omit if the user wants the risk unattached. If the model is being registered in this same turn, use pending_model_approval_id INSTEAD of model_id.\n5. Once you have all the user's stated info, call this tool exactly once. Then tell the user to open Pending Approvals to approve or reject.",
    parameters: {
      type: "object",
      properties: {
        model_id: {
          type: "number",
          description:
            "Existing model ID to attach the risk to. Use when the model already exists in the inventory. Mutually exclusive with pending_model_approval_id.",
        },
        pending_model_approval_id: {
          type: "number",
          description:
            "Same-turn-as-model-registration path: pass the approvalRequestId returned by agent_register_model in the SAME turn. The executor resolves the eventual model_id once the user approves the model, and links this risk to it. Mutually exclusive with model_id.",
        },
        risk_name: {
          type: "string",
          description:
            "A concise, descriptive name for the model risk. Required. 3–255 characters.",
        },
        description: {
          type: "string",
          description:
            "Detailed description of the risk, including potential causes and consequences. Optional. Max 2048 characters.",
        },
        risk_category: {
          type: "string",
          enum: RISK_CATEGORIES,
          description: "The category of the model risk.",
        },
        risk_level: {
          type: "string",
          enum: RISK_LEVELS,
          description: "The severity level of the model risk.",
        },
        status: {
          type: "string",
          enum: RISK_STATUSES,
          description: "Initial status. Defaults to 'Open' if omitted.",
        },
        owner: {
          type: "number",
          description:
            "Owner user ID (integer FK to users.id). Resolve names to user IDs via list_users first. Do NOT pass a name string.",
        },
        target_date: {
          type: "string",
          description: "Target date for risk review or mitigation (ISO 8601, e.g. 2026-04-15).",
        },
        mitigation_plan: {
          type: "string",
          description: "Plan for mitigating the risk. Max 2048 characters.",
        },
        impact: {
          type: "string",
          description:
            "Description of the potential impact if the risk materializes. Max 2048 characters.",
        },
        likelihood: {
          type: "string",
          description: "Likelihood of the risk occurring (free-form). Max 255 characters.",
        },
      },
      required: ["risk_name"],
    },
  },
};
