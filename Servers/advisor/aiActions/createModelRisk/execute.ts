/**
 * Post-approval executor for `agent_create_model_risk` (user-driven).
 *
 * Runs inside the approval transaction. Delegates to
 * `createNewModelRiskQuery` so manual-UI risk creation and AI-driven
 * creation share the same insert path.
 */

import { sequelize } from "../../../database/db";
import { createNewModelRiskQuery } from "../../../utils/modelRisk.utils";
import { TransientApprovalError } from "../../approval/approvalGateway";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentCreateModelRiskInput } from "./schema";

export async function executeCreateModelRisk(
  ctx: AiActionExecuteContext<AgentCreateModelRiskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  // Resolve the model id. Two paths:
  //   1. Direct model_id (existing model).
  //   2. pending_model_approval_id — a sibling approval from the same
  //      conversation turn that proposed the model. We look it up and
  //      either resolve to entity_id (if approved) or throw a transient
  //      error (if still pending). Mirrors agent_suggest_model_risk.
  let resolvedModelId: number | undefined = input.model_id;

  if (input.pending_model_approval_id !== undefined) {
    const [approvalRows] = (await sequelize.query(
      `SELECT status, entity_id FROM approval_requests
         WHERE id = :request_id AND organization_id = :organization_id`,
      {
        replacements: {
          request_id: input.pending_model_approval_id,
          organization_id: ctx.organizationId,
        },
        transaction: ctx.transaction,
      },
    )) as [Array<{ status: string; entity_id: number | null }>, unknown];

    if (!approvalRows || approvalRows.length === 0) {
      throw new Error(
        `Cannot create this model risk: model approval request #${input.pending_model_approval_id} was not found.`,
      );
    }

    const approval = approvalRows[0];
    if (approval.status !== "Approved") {
      // Retryable — the gateway keeps the approval in pending_approval
      // state so the user can click Approve again once they approve
      // the model.
      throw new TransientApprovalError(
        `Approve the model first. The associated model registration (approval request #${input.pending_model_approval_id}) is still ${approval.status}. Open Pending Approvals, approve the model, then come back and approve this risk.`,
      );
    }

    if (approval.entity_id == null) {
      throw new Error(
        `Model approval #${input.pending_model_approval_id} is approved but has no recorded entity_id — cannot link this risk. Ask an admin to investigate.`,
      );
    }

    resolvedModelId = approval.entity_id;
  }

  // Re-check the model FK at execute time. Between file-time and
  // execute-time the model could have been deleted.
  if (resolvedModelId !== undefined) {
    const [modelRows] = (await sequelize.query(
      `SELECT id FROM model_inventories
         WHERE id = :model_id AND organization_id = :organization_id`,
      {
        replacements: {
          model_id: resolvedModelId,
          organization_id: ctx.organizationId,
        },
        transaction: ctx.transaction,
      },
    )) as [Array<{ id: number }>, unknown];
    if (!modelRows || modelRows.length === 0) {
      throw new Error(
        `Model #${resolvedModelId} no longer exists in this organization — cannot link the new model risk.`,
      );
    }
  }

  const created = await createNewModelRiskQuery(
    {
      model_id: resolvedModelId,
      risk_name: input.risk_name,
      description: input.description ?? "",
      risk_category: input.risk_category as any,
      risk_level: input.risk_level as any,
      status: (input.status ?? "Open") as any,
      owner: (input.owner ?? null) as any,
      target_date: input.target_date as any,
      mitigation_plan: input.mitigation_plan ?? "",
      impact: input.impact ?? "",
      likelihood: input.likelihood ?? "",
    },
    ctx.organizationId,
    ctx.transaction,
  );

  if (created.id == null) {
    throw new Error(
      "createNewModelRiskQuery returned a model risk without an id — refusing to record an empty execution result.",
    );
  }

  return { entityId: created.id };
}
