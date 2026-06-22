/**
 * File-time handler for `agent_create_model_risk` (user-driven path).
 *
 * Mirrors aiActions/createRisk/file.ts. Validates input, lazy-creates
 * the per-tenant AI Action workflow, and inserts an approval_requests
 * row that the dedicated Pending Approvals page picks up.
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
import { AgentCreateModelRiskSchema } from "./schema";
import { renderCreateModelRiskPreview } from "./preview";

export const CREATE_MODEL_RISK_TOOL_NAME = "agent_create_model_risk";

export async function fileCreateModelRisk(
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

  // Strip the bridge-injected `_userId` (and `_organizationId`) before
  // strict-parsing — see toolBridge.ts:148.
  const { _userId: _u, _organizationId: _o, ...userParams } = params as Record<string, unknown>;
  void _u;
  void _o;
  const parsed = AgentCreateModelRiskSchema.safeParse(userParams);
  if (!parsed.success) {
    const errorList = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `agent_create_model_risk validation failed. You MUST tell the user verbatim that the following fields had invalid values and ask them for corrected values for each one before retrying. DO NOT call this tool again until every error below is addressed:\n${errorList}`,
    );
  }

  // model_id and pending_model_approval_id are mutually exclusive paths.
  // Tell the LLM which to use loudly if it passes both.
  if (parsed.data.model_id !== undefined && parsed.data.pending_model_approval_id !== undefined) {
    throw new Error(
      "agent_create_model_risk: pass either model_id (for an existing model) OR pending_model_approval_id (for a model being registered in the same turn), not both. Drop one and retry.",
    );
  }

  // FK guard: if model_id was given, the model must already exist in
  // this org. Catches LLM passing the id of a row still pending approval.
  if (parsed.data.model_id !== undefined) {
    const [modelRows] = (await sequelize.query(
      `SELECT id FROM model_inventories
         WHERE id = :model_id AND organization_id = :organization_id`,
      {
        replacements: {
          model_id: parsed.data.model_id,
          organization_id: organizationId,
        },
      },
    )) as [Array<{ id: number }>, unknown];
    if (!modelRows || modelRows.length === 0) {
      throw new Error(
        `agent_create_model_risk cannot link to model #${parsed.data.model_id}: that model does not exist in this organization. If the model is still pending approval, wait for it to be approved before referencing its id. Resolve via fetch_model_inventories, or omit model_id to create an unattached model risk.`,
      );
    }
  }

  // pending_model_approval_id sanity check: the referenced approval row
  // must exist and be an agent_register_model row in this org.
  if (parsed.data.pending_model_approval_id !== undefined) {
    const [approvalRows] = (await sequelize.query(
      `SELECT id, status, entity_data->>'tool_name' AS tool_name
         FROM approval_requests
        WHERE id = :request_id AND organization_id = :organization_id`,
      {
        replacements: {
          request_id: parsed.data.pending_model_approval_id,
          organization_id: organizationId,
        },
      },
    )) as [Array<{ id: number; status: string; tool_name: string }>, unknown];
    if (!approvalRows || approvalRows.length === 0) {
      throw new Error(
        `agent_create_model_risk: pending_model_approval_id=${parsed.data.pending_model_approval_id} does not match any approval request in this organization.`,
      );
    }
    if (approvalRows[0].tool_name !== "agent_register_model") {
      throw new Error(
        `agent_create_model_risk: pending_model_approval_id=${parsed.data.pending_model_approval_id} is for tool "${approvalRows[0].tool_name}", not agent_register_model. Pass the approvalRequestId from a same-turn agent_register_model call.`,
      );
    }
  }

  const transaction = await sequelize.transaction();
  try {
    const workflow = await ensureAiActionWorkflow(organizationId, userId, transaction);

    const workflowSteps = await getWorkflowStepsQuery(workflow.id!, organizationId, transaction);

    if (!workflowSteps || workflowSteps.length === 0) {
      throw new Error("AI Action workflow has no steps — cannot file approval request");
    }

    const preview = renderCreateModelRiskPreview(parsed.data);

    const approvalRequest = await createApprovalRequestQuery(
      {
        request_name: `AI: create model risk "${parsed.data.risk_name}"`,
        workflow_id: workflow.id!,
        entity_type: EntityType.AI_ACTION,
        entity_data: {
          tool_name: CREATE_MODEL_RISK_TOOL_NAME,
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
      message: `Created approval request #${approvalRequest.id}. Tell the user to open Pending Approvals to approve or reject "${preview}".`,
    };
  } catch (error) {
    await transaction.rollback();
    logger.error(`[${CREATE_MODEL_RISK_TOOL_NAME}] failed to file approval request`, error);
    return {
      status: "error",
      message: `Failed to file approval request: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
