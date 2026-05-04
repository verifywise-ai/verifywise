/**
 * File-time handler for `agent_update_risk`.
 *
 * Differs from `createRisk/file.ts` in two ways:
 *   1. It loads the current risk (via `getRiskByIdQuery`) so the
 *      approval preview can show a before/after diff instead of just
 *      the new values.
 *   2. If the risk doesn't exist or is soft-deleted, it returns an
 *      error result immediately — no approval request is filed for
 *      a target that can't be updated.
 *
 * Everything else (strict schema validation, lazy workflow creation,
 * approval_request insert, transaction handling) mirrors the create
 * path.
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
import { AgentUpdateRiskSchema } from "./schema";
import { renderUpdateRiskDiffPreview } from "./preview";

export const UPDATE_RISK_TOOL_NAME = "agent_update_risk";

export async function fileUpdateRisk(
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

  // 1. Strict schema validation — rejects unknown keys, enum drift, and
  //    the "risk_id only" no-op case.
  const parsed = AgentUpdateRiskSchema.safeParse(params);
  if (!parsed.success) {
    return {
      status: "validation_failed",
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
      message:
        "The proposed risk update failed validation. Re-check the tool's parameter schema and try again.",
    };
  }

  // 2. Load the current risk so we can render a diff preview AND
  //    confirm the target exists. `getRiskByIdQuery` runs outside any
  //    transaction, which is fine at file-time — the actual update
  //    re-reads inside the approve transaction.
  const currentRisk = await getRiskByIdQuery(parsed.data.risk_id, organizationId, false);

  if (!currentRisk) {
    return {
      status: "error",
      message: `Risk #${parsed.data.risk_id} not found (or has been deleted) in this organization. Ask the user to clarify which risk they meant, or call fetch_risks to find candidates.`,
    };
  }

  // 3. Open a transaction so workflow lazy-creation + approval-request
  //    insert commit atomically.
  const transaction = await sequelize.transaction();
  try {
    const workflow = await ensureAiActionWorkflow(organizationId, userId, transaction);

    const workflowSteps = await getWorkflowStepsQuery(workflow.id!, organizationId, transaction);

    if (!workflowSteps || workflowSteps.length === 0) {
      throw new Error("AI Action workflow has no steps — cannot file approval request");
    }

    const preview = renderUpdateRiskDiffPreview(parsed.data, currentRisk);

    const approvalRequest = await createApprovalRequestQuery(
      {
        request_name: `AI: update risk "${currentRisk.risk_name ?? `#${parsed.data.risk_id}`}"`,
        workflow_id: workflow.id!,
        entity_type: EntityType.AI_ACTION,
        entity_data: {
          tool_name: UPDATE_RISK_TOOL_NAME,
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
    logger.error(`[${UPDATE_RISK_TOOL_NAME}] failed to file approval request`, error);
    return {
      status: "error",
      message: `Failed to file approval request: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
