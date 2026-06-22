/**
 * File-time handler for `agent_create_risk`.
 *
 * Called by the LLM via the tool bridge whenever the model decides to
 * propose a new risk. This function does NOT create the risk — it:
 *
 *   1. Strict-validates the LLM's params against `AgentCreateRiskSchema`.
 *   2. Opens a transaction and ensures the per-tenant "AI Action Approval"
 *      workflow exists.
 *   3. Inserts an `approval_request` row with entity_type='ai_action' and
 *      an `entity_data` payload that the generic executor in
 *      `aiActions/executor.ts` will pick up after approval.
 *   4. Returns a `pending_approval` status that the LLM uses to craft its
 *      user-facing reply ("I've filed an approval request, go to Pending
 *      Approvals...").
 *
 * Moved from `Servers/advisor/functions/riskFunctions.ts` during the
 * aiActions reorganization. No logic changes beyond the import paths and
 * the renamed local preview function.
 */

import { sequelize } from "../../../database/db";
import logger from "../../../utils/logger/fileLogger";
import { createApprovalRequestQuery } from "../../../utils/approvalRequest.utils";
import { getWorkflowStepsQuery } from "../../../utils/approvalWorkflow.utils";
import {
  ApprovalRequestStatus,
  EntityType,
} from "../../../domain.layer/enums/approval-workflow.enum";
import type { AiActionFileResult } from "../types";
import { ensureAiActionWorkflow } from "../workflow";
import { AgentCreateRiskSchema } from "./schema";
import { renderCreateRiskPreview } from "./preview";

export const CREATE_RISK_TOOL_NAME = "agent_create_risk";

export async function fileCreateRisk(
  params: Record<string, unknown>,
  organizationId: number,
  userId?: number,
): Promise<AiActionFileResult> {
  if (!userId) {
    return {
      status: "error",
      message:
        "Cannot propose AI write action: no authenticated user context. This tool requires a logged-in user.",
    };
  }

  // 1. Strict schema validation — rejects unknown keys and enum drift.
  // Strip the bridge-injected `_userId` (and `_organizationId`) before
  // strict-parsing — see toolBridge.ts which always appends `_userId`.
  const { _userId: _u, _organizationId: _o, ...userParams } = params as Record<string, unknown>;
  void _u;
  void _o;
  const parsed = AgentCreateRiskSchema.safeParse(userParams);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    const errorList = errors.map((e) => `- ${e.path}: ${e.message}`).join("\n");
    // Throw so the LLM treats this as a hard failure and surfaces it to
    // the user. Returning a soft `validation_failed` object had a habit of
    // being silently summarized away — the bland message did not force the
    // model to relay specifics, so the user never saw which fields were
    // bad and the risk silently disappeared from the conversation.
    throw new Error(
      `agent_create_risk validation failed. You MUST tell the user verbatim that the following fields had invalid values and ask them for corrected values for each one before retrying. DO NOT call this tool again until every error below is addressed:\n${errorList}`,
    );
  }

  // 2. Open a transaction so workflow lazy-creation + approval-request
  //    insert commit atomically.
  const transaction = await sequelize.transaction();
  try {
    const workflow = await ensureAiActionWorkflow(organizationId, userId, transaction);

    const workflowSteps = await getWorkflowStepsQuery(workflow.id!, organizationId, transaction);

    if (!workflowSteps || workflowSteps.length === 0) {
      throw new Error("AI Action workflow has no steps — cannot file approval request");
    }

    const preview = renderCreateRiskPreview(parsed.data);

    const approvalRequest = await createApprovalRequestQuery(
      {
        request_name: `AI: create risk "${parsed.data.risk_name}"`,
        workflow_id: workflow.id!,
        entity_type: EntityType.AI_ACTION,
        entity_data: {
          tool_name: CREATE_RISK_TOOL_NAME,
          input_params: parsed.data,
          preview,
          requested_via: "ai_advisor",
        },
        status: ApprovalRequestStatus.PENDING,
        requested_by: userId,
      },
      workflowSteps,
      organizationId,
      transaction,
    );

    await transaction.commit();

    return {
      status: "pending_approval",
      approvalRequestId: approvalRequest.id!,
      preview,
      message: `Created approval request #${approvalRequest.id}. Tell the user to open Pending Approvals to approve or reject "${preview}". Also let them know: once approved, a review task will be auto-created and assigned to the risk owner with a deadline based on the risk severity, and the risk owner (and any linked project owners) will be notified.`,
    };
  } catch (error) {
    await transaction.rollback();
    logger.error(`[${CREATE_RISK_TOOL_NAME}] failed to file approval request`, error);
    return {
      status: "error",
      message: `Failed to file approval request: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
