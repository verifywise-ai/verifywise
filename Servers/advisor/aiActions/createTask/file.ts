/**
 * File-time handler for `agent_create_task`.
 *
 * Called by the LLM via the tool bridge whenever the model decides to
 * propose a new task. This function does NOT create the task — it:
 *
 *   1. Strict-validates the LLM's params against `AgentCreateTaskSchema`.
 *   2. Opens a transaction and ensures the per-tenant "AI Action Approval"
 *      workflow exists.
 *   3. Inserts an `approval_request` row with entity_type='ai_action' and
 *      an `entity_data` payload that the generic executor in
 *      `aiActions/executor.ts` will pick up after approval.
 *   4. Returns a `pending_approval` status that the LLM uses to craft its
 *      user-facing reply.
 *
 * Mirror of `aiActions/createRisk/file.ts` with the risk-specific bits
 * swapped for task-specific ones. Any change to this file's shape should
 * also update createRisk/file.ts to keep the two in step.
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
import { AgentCreateTaskSchema } from "./schema";
import { renderCreateTaskPreview } from "./preview";

export const CREATE_TASK_TOOL_NAME = "agent_create_task";

export async function fileCreateTask(
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
  const parsed = AgentCreateTaskSchema.safeParse(params);
  if (!parsed.success) {
    return {
      status: "validation_failed",
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
      message:
        "The proposed task payload failed validation. Re-check the tool's parameter schema and try again.",
    };
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

    const preview = renderCreateTaskPreview(parsed.data);

    const approvalRequest = await createApprovalRequestQuery(
      {
        request_name: `AI: create task "${parsed.data.title}"`,
        workflow_id: workflow.id!,
        entity_type: EntityType.AI_ACTION,
        entity_data: {
          tool_name: CREATE_TASK_TOOL_NAME,
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
    logger.error(`[${CREATE_TASK_TOOL_NAME}] failed to file approval request`, error);
    return {
      status: "error",
      message: `Failed to file approval request: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
