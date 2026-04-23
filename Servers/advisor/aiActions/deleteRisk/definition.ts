/**
 * LLM-facing tool definition for `agent_delete_risk`.
 *
 * Kept deliberately narrow so the approval modal renders a clear
 * intent ("Delete risk X") and so Phase 2's rule engine has a
 * single, unambiguous tool name to match auto-approve rules against.
 * Do NOT merge this into `agent_update_risk` with a `status: 'deleted'`
 * parameter — see the "why deletes stay narrow" note in the
 * ai-advisor-write-tools.md doc.
 */

import type { AiActionToolDefinition } from "../types";

export const deleteRiskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_delete_risk",
    description:
      "Propose soft-deleting a risk. This is a WRITE action — it does NOT execute immediately. It files an approval request and returns a pending_approval status; a human Admin must approve before the risk is deleted.\n\nSoft delete only — the row stays in the database with is_deleted=true for audit purposes. The risk stops appearing in the main Risk Management table after deletion.\n\nIMPORTANT — target resolution:\n1. If the user did NOT provide a specific risk id, call `fetch_risks` FIRST to find candidates matching their description. If exactly one matches, use its id. If multiple match, ask the user to pick. If none match, tell the user.\n2. Deletion is destructive from the user's perspective even though it's soft. Before calling this tool, briefly confirm with the user which risk you're about to delete — show the name and id — unless they were already explicit.\n3. Include an optional `reason` if the user explained why — it goes in the audit trail.\n\nCall this tool exactly once once you have the target id.",
    parameters: {
      type: "object",
      properties: {
        risk_id: {
          type: "number",
          description:
            "Id of the risk to soft-delete. Required. Resolve via `fetch_risks` if the user didn't specify one.",
        },
        reason: {
          type: "string",
          description:
            "Optional short reason for the deletion — recorded in the audit trail. Max 512 characters.",
        },
      },
      required: ["risk_id"],
    },
  },
};
