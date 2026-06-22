/**
 * File-time handler for `agent_register_model`.
 *
 * Mirrors the shape of `aiActions/createRisk/file.ts`. Validates input,
 * lazy-creates the per-tenant AI Action workflow, and inserts an
 * `approval_requests` row that the dedicated Pending Approvals page (and
 * the chat UI's pending-list) will both pick up.
 *
 * Replaces the older createWriteToolFn-based path that wrote to
 * `ai_action_approvals` and tried to bridge — the bridge silently failed
 * when no workflow existed and the chat-card approval never showed up
 * in the Pending Approvals UI. The single-table approach here is the
 * canonical pattern other write tools (createRisk, createTask, etc.)
 * already use.
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
import { AgentRegisterModelSchema } from "./schema";
import { renderRegisterModelPreview } from "./preview";

export const REGISTER_MODEL_TOOL_NAME = "agent_register_model";

export async function fileRegisterModel(
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

  // Strip the bridge-injected `_userId` (and any future `_organizationId`)
  // before strict-parsing — the schema is `.strict()` so unknown keys are
  // rejected. See toolBridge.ts which always appends `_userId` to params.
  const { _userId: _u, _organizationId: _o, ...userParams } = params as Record<string, unknown>;
  void _u;
  void _o;
  const parsed = AgentRegisterModelSchema.safeParse(userParams);
  if (!parsed.success) {
    const errorList = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `agent_register_model validation failed. You MUST tell the user verbatim that the following fields had invalid values and ask them for corrected values for each one before retrying. DO NOT call this tool again until every error below is addressed:\n${errorList}`,
    );
  }

  // Idempotency guard: the LLM occasionally fires agent_register_model
  // twice in one turn with identical params (a real incident — see
  // logs around 2026-04-29 19:48 where requests #50 and #55 produced
  // two testModel rows). Approving both creates duplicate inventory
  // rows. Detect a still-PENDING approval for the same (org, user,
  // name, provider, version, project_id) tuple and reuse it instead.
  // We match on the JSONB entity_data fields so we don't depend on a
  // separate index.
  {
    const existing = (await sequelize.query(
      `SELECT id, entity_data
         FROM approval_requests
        WHERE organization_id = :organization_id
          AND requested_by    = :requested_by
          AND status          = 'Pending'
          AND entity_type     = 'ai_action'
          AND entity_data->>'tool_name' = 'agent_register_model'
          AND entity_data->'input_params'->>'name'        = :name
          AND COALESCE(entity_data->'input_params'->>'model_type', '') = :model_type
          AND COALESCE(entity_data->'input_params'->>'version',    '') = :version
          AND COALESCE((entity_data->'input_params'->>'project_id')::int, 0) = :project_id
        ORDER BY id DESC
        LIMIT 1`,
      {
        replacements: {
          organization_id: organizationId,
          requested_by: userId,
          name: parsed.data.name,
          model_type: parsed.data.model_type ?? "",
          version: parsed.data.version ?? "",
          project_id: parsed.data.project_id ?? 0,
        },
      },
    )) as [Array<{ id: number; entity_data: { preview?: string } }>, unknown];

    const dup = existing[0]?.[0];
    if (dup?.id) {
      const dupPreview = dup.entity_data?.preview ?? renderRegisterModelPreview(parsed.data);
      logger.info(
        `[fileRegisterModel] duplicate suppressed — re-using pending approval #${dup.id} for "${parsed.data.name}" (org=${organizationId}, user=${userId})`,
      );
      // Return the EXISTING approval request id so the LLM's same-turn
      // agent_suggest_model_risk calls still wire pending_model_approval_id
      // to the right row.
      return {
        status: "pending_approval",
        approvalRequestId: dup.id,
        preview: dupPreview,
        message: `An approval request for this exact model registration is ALREADY PENDING — request #${dup.id}. Do NOT call agent_register_model again. If you have not yet filed the 3-5 agent_suggest_model_risk inline approvals for this model, do that NOW with pending_model_approval_id=${dup.id}. Otherwise stop and tell the user the request is already pending.`,
      };
    }
  }

  // FK guard: if a project_id was given, the project must already exist
  // in this org. Catches LLM passing a still-pending project id.
  if (parsed.data.project_id !== undefined) {
    const [projectRows] = (await sequelize.query(
      `SELECT id FROM projects
         WHERE id = :project_id AND organization_id = :organization_id`,
      {
        replacements: {
          project_id: parsed.data.project_id,
          organization_id: organizationId,
        },
      },
    )) as [Array<{ id: number }>, unknown];
    if (!projectRows || projectRows.length === 0) {
      throw new Error(
        `agent_register_model cannot link to project #${parsed.data.project_id}: that project does not exist in this organization. If the project is still pending approval, wait for it to be approved before referencing its id. Resolve via list_projects, or omit project_id to register an unlinked model.`,
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

    const preview = renderRegisterModelPreview(parsed.data);

    const approvalRequest = await createApprovalRequestQuery(
      {
        request_name: `AI: register model "${parsed.data.name}"`,
        workflow_id: workflow.id!,
        entity_type: EntityType.AI_ACTION,
        entity_data: {
          tool_name: REGISTER_MODEL_TOOL_NAME,
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
      // CRITICAL: the message text below is an imperative DIRECTIVE
      // to the model, not a script for the user-facing reply. Earlier
      // turns showed the model paraphrasing this instruction as prose
      // ("I've filed N suggested risks below...") without firing any
      // agent_suggest_model_risk tool calls. The wording is therefore
      // anti-narrative on purpose: it tells the model to STOP and
      // act, with explicit anti-patterns called out.
      message: `STOP. Do not write any user-facing text yet. Your next assistant action MUST be tool invocations — specifically, between 3 and 5 PARALLEL calls to agent_suggest_model_risk in this same turn. Each call must include pending_model_approval_id=${approvalRequest.id} and OMIT model_id. Tailor each risk to the model's provider/country/hosting/capabilities (the agent_suggest_model_risk tool description has the reasoning dimensions and the valid risk_category enum values). Only AFTER those tool calls return may you write a brief plain-text summary to the user. Do not describe what you "are about to" file or what you "have filed" — actually file them. Listing risks in markdown is NOT a substitute for tool calls; the user cannot approve text.`,
    };
  } catch (error) {
    await transaction.rollback();
    logger.error(`[${REGISTER_MODEL_TOOL_NAME}] failed to file approval request`, error);
    return {
      status: "error",
      message: `Failed to file approval request: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
