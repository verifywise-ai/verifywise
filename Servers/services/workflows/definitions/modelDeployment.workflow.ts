/**
 * Phase 6 — Model Deployment Workflow.
 *
 * Trigger: model.status = "Deployed" (status -> Approved).
 * Steps:
 *   1. Risk Agent — model-specific risk assessment lookup
 *   2. Compliance Agent — framework control coverage check
 *   3. Branch: if evidence gaps -> create an evidence-collection task
 *      (Model agent) else -> generate a readiness report
 *   4. Notify admins (always)
 *
 * Ported faithfully from the Phase 5/6 reference build
 * (dist/services/workflows/definitions/modelDeployment.workflow.js).
 */

import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { sendBulkInAppNotifications } from "../../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
import { StepResult, WorkflowContext, WorkflowDefinition } from "../types";

/** Controls gap count at/above this threshold → evidence gap branch. */
const MISSING_EVIDENCE_THRESHOLD = 5;

interface RiskSnapshot {
  count: number;
  criticalCount: number;
}

interface ControlCoverage {
  frameworkType: string;
  avgScore: number;
  totalControls: number;
  gapControls: number;
}

/** Count of model-scoped risks (and the critical subset) for the snapshot. */
async function fetchRiskSnapshot(
  orgId: number,
  modelId: unknown,
): Promise<RiskSnapshot> {
  if (!modelId) return { count: 0, criticalCount: 0 };
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE severity IN ('Major','Catastrophic'))::int AS critical
       FROM model_risks mr
      WHERE mr.organization_id = :orgId
        AND mr.model_id = :modelId`,
    { replacements: { orgId, modelId }, type: QueryTypes.SELECT },
  )) as Array<{ total: number; critical: number }>;
  const r = rows[0] || { total: 0, critical: 0 };
  return { count: Number(r.total) || 0, criticalCount: Number(r.critical) || 0 };
}

/** Org-level framework readiness rows summarised into control coverage. */
async function fetchControlCoverage(orgId: number): Promise<ControlCoverage[]> {
  const rows = (await sequelize.query(
    `SELECT framework_type, avg_score::int AS avg_score,
            (ready_count + needs_work_count + at_risk_count + not_started_count)::int AS total_controls,
            (at_risk_count + not_started_count)::int AS gap_controls
       FROM framework_readiness_scores
      WHERE organization_id = :orgId
        AND project_id IS NULL`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{
    framework_type: string;
    avg_score: number;
    total_controls: number;
    gap_controls: number;
  }>;
  return rows.map((r) => ({
    frameworkType: r.framework_type,
    avgScore: Number(r.avg_score) || 0,
    totalControls: Number(r.total_controls) || 0,
    gapControls: Number(r.gap_controls) || 0,
  }));
}

/** All Admin-role users for an organization (id only is consumed downstream). */
async function getOrgAdmins(
  organizationId: number,
): Promise<Array<{ id: number }>> {
  const rows = (await sequelize.query(
    `SELECT u.id
       FROM users u
      WHERE u.organization_id = :organizationId
        AND u.role_id = 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows.map((u) => ({ id: Number(u.id) }));
}

/** Fan-out an in-app notification to every org admin (no-op when none). */
async function notifyAdmins(
  ctx: WorkflowContext,
  title: string,
  message: string,
): Promise<void> {
  const admins = await getOrgAdmins(ctx.organizationId);
  if (admins.length === 0) return;
  await sendBulkInAppNotifications(ctx.organizationId, {
    user_ids: admins.map((a) => a.id),
    type: NotificationType.SYSTEM,
    title,
    message,
    entity_type: NotificationEntityType.MODEL,
    metadata: { workflow_run_id: ctx.workflowRunId },
  });
}

export const modelDeploymentWorkflow: WorkflowDefinition = {
  id: "model_deployment",
  name: "Model Deployment Compliance",
  triggerName: "model.status.deployed",
  agents: ["risk", "compliance", "model"],
  steps: [
    {
      id: "risk_assessment",
      description: "Assess model-specific risks",
      agent: "risk",
      isWrite: false,
      handler: async (ctx): Promise<StepResult> => {
        const trigger = ctx.triggerPayload as { modelId?: unknown };
        const snapshot = await fetchRiskSnapshot(ctx.organizationId, trigger.modelId);
        return { type: "ok", output: snapshot };
      },
    },
    {
      id: "control_coverage",
      description: "Check framework control coverage",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx): Promise<StepResult> => {
        const coverage = await fetchControlCoverage(ctx.organizationId);
        return { type: "ok", output: coverage };
      },
    },
    {
      id: "decide_evidence_gap",
      description: "Branch on whether evidence collection is needed",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx): Promise<StepResult> => {
        const coverage = (ctx.results.control_coverage as ControlCoverage[]) || [];
        const totalGaps = coverage.reduce((acc, c) => acc + (c.gapControls || 0), 0);
        if (totalGaps >= MISSING_EVIDENCE_THRESHOLD) {
          return { type: "branch", gotoStepId: "create_evidence_task" };
        }
        return { type: "branch", gotoStepId: "ready_report" };
      },
    },
    {
      id: "create_evidence_task",
      description: "Flag evidence collection task for admins",
      agent: "model",
      isWrite: true,
      handler: async (ctx): Promise<StepResult> => {
        const trigger = ctx.triggerPayload as {
          modelName?: string;
          requireApproval?: boolean;
        };
        // Write step: gate behind approval when the trigger requests it so
        // the engine can pause the run in 'awaiting_approval'.
        if (trigger.requireApproval) {
          return { type: "pause", reason: "Evidence collection task requires approval" };
        }
        await notifyAdmins(
          ctx,
          "Model deployment requires evidence",
          `${trigger.modelName || "A model"} has been deployed but has open control gaps. Please assign evidence collection.`,
        );
        return { type: "ok", output: { evidence_task_flagged: true } };
      },
    },
    {
      id: "notify_completion",
      description: "Notify admins workflow completed",
      agent: "model",
      isWrite: false,
      handler: async (ctx): Promise<StepResult> => {
        const trigger = ctx.triggerPayload as { modelName?: string };
        await notifyAdmins(
          ctx,
          "Model deployment workflow completed",
          `Compliance review for ${trigger.modelName || "a model"} finished. See workflow run ${ctx.workflowRunId}.`,
        );
        return { type: "ok", output: { notified: true } };
      },
    },
    {
      id: "ready_report",
      description: "Mark workflow as ready (no evidence gap)",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx): Promise<StepResult> => {
        const trigger = ctx.triggerPayload as { modelName?: string };
        await notifyAdmins(
          ctx,
          "Model deployment compliance ready",
          `Deployment for ${trigger.modelName || "a model"} passed all control checks.`,
        );
        return { type: "ok", output: { report_ready: true } };
      },
    },
  ],
};
