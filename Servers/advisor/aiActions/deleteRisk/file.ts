/**
 * File-time handler for `agent_delete_risk`.
 *
 * Loads the current risk to (a) confirm the target exists before
 * filing an approval, and (b) produce a preview that shows the risk
 * name and current severity/status so the approver isn't making a
 * blind decision on "risk #42".
 */

import { sequelize } from "../../../database/db";
import logger from "../../../utils/logger/fileLogger";
import { createApprovalRequestQuery } from "../../../utils/approvalRequest.utils";
import { getWorkflowStepsQuery } from "../../../utils/approvalWorkflow.utils";
import { getRiskByIdQuery } from "../../../utils/risk.utils";
import {
  ApprovalRequestStatus,
  EntityType,
} from "../../../domain.layer/enums/approval-workflow.enum";
import type { AiActionFileResult } from "../types";
import { ensureAiActionWorkflow } from "../workflow";
import { AgentDeleteRiskSchema } from "./schema";
import { renderDeleteRiskDetailedPreview } from "./preview";

export const DELETE_RISK_TOOL_NAME = "agent_delete_risk";

export async function fileDeleteRisk(
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

  const parsed = AgentDeleteRiskSchema.safeParse(params);
  if (!parsed.success) {
    return {
      status: "validation_failed",
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
      message:
        "The proposed risk deletion failed validation. Re-check the tool's parameter schema and try again.",
    };
  }

  const currentRisk = await getRiskByIdQuery(parsed.data.risk_id, organizationId, false);

  if (!currentRisk) {
    return {
      status: "error",
      message: `Risk #${parsed.data.risk_id} not found (or already deleted) in this organization. Ask the user to clarify which risk they meant.`,
    };
  }

  const transaction = await sequelize.transaction();
  try {
    const workflow = await ensureAiActionWorkflow(organizationId, userId, transaction);

    const workflowSteps = await getWorkflowStepsQuery(workflow.id!, organizationId, transaction);

    if (!workflowSteps || workflowSteps.length === 0) {
      throw new Error("AI Action workflow has no steps — cannot file approval request");
    }

    const preview = renderDeleteRiskDetailedPreview(parsed.data, {
      risk_name: currentRisk.risk_name,
      severity: currentRisk.severity,
      mitigation_status: currentRisk.mitigation_status,
    });

    const approvalRequest = await createApprovalRequestQuery(
      {
        request_name: `AI: delete risk "${currentRisk.risk_name ?? `#${parsed.data.risk_id}`}"`,
        workflow_id: workflow.id!,
        entity_type: EntityType.AI_ACTION,
        entity_data: {
          tool_name: DELETE_RISK_TOOL_NAME,
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
      message: `Created approval request #${approvalRequest.id}. Tell the user to open Pending Approvals and approve or reject "${preview}".`,
    };
  } catch (error) {
    await transaction.rollback();
    logger.error(`[${DELETE_RISK_TOOL_NAME}] failed to file approval request`, error);
    return {
      status: "error",
      message: `Failed to file approval request: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
