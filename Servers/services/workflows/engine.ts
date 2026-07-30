/**
 * Phase 6 — Workflow execution engine.
 *
 * Walks a WorkflowDefinition step by step, supporting branching (jump to a
 * named step), skipping, pausing for approval, and short-circuit failures.
 *
 * Each transition is persisted to ai_workflow_runs and ai_action_audit_log.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";
import { getWorkflow } from "./registry";
import {
  StepRecord,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunParams,
  WorkflowRunState,
} from "./types";

/**
 * Append one audit row to ai_action_audit_log describing a state transition.
 * Audit failures are logged but never abort a run.
 */
async function logWorkflowAudit(
  organizationId: number,
  workflowRunId: number,
  toState: string,
  ruleName: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO ai_action_audit_log
         (organization_id, action_approval_id, command_id, workflow_run_id,
          from_state, to_state, actor_type, rule_name, metadata, created_at)
       VALUES
         (:organizationId, NULL, NULL, :workflowRunId,
          NULL, :toState, 'system', :ruleName, :metadata::jsonb, NOW())`,
      {
        replacements: {
          organizationId,
          workflowRunId,
          toState,
          ruleName,
          metadata: JSON.stringify(metadata),
        },
        type: QueryTypes.INSERT,
      },
    );
  } catch (error) {
    logger.error(`[workflow] audit insert failed for ${workflowRunId}:`, error);
  }
}

/**
 * Persist the current run state, step pointer, accumulated step records and
 * any error to ai_workflow_runs.
 */
async function persistRun(
  runId: number,
  organizationId: number,
  state: WorkflowRunState,
  currentStep: number,
  results: StepRecord[],
  error?: string,
): Promise<void> {
  await sequelize.query(
    `UPDATE ai_workflow_runs
        SET state = :state,
            current_step = :currentStep,
            results = :results::jsonb,
            error = :error,
            completed_at = CASE WHEN :state IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END
      WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: {
        id: runId,
        organizationId,
        state,
        currentStep,
        results: JSON.stringify(results),
        error: error ?? null,
      },
      type: QueryTypes.UPDATE,
    },
  );
}

/**
 * Create a new workflow run row in the DB and return the row id.
 */
async function createRun(workflow: WorkflowDefinition, params: WorkflowRunParams): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO ai_workflow_runs
       (organization_id, workflow_type, trigger_name, trigger_payload, state, current_step, results, started_by)
     VALUES
       (:organizationId, :workflowType, :triggerName, :triggerPayload::jsonb, 'pending', 0, '[]'::jsonb, :userId)
     RETURNING id`,
    {
      replacements: {
        organizationId: params.organizationId,
        workflowType: workflow.id,
        triggerName: workflow.triggerName,
        triggerPayload: JSON.stringify(params.triggerPayload || {}),
        userId: params.userId ?? null,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  const id = rows[0].id;
  await logWorkflowAudit(params.organizationId, id, "pending", `workflow.${workflow.id}.created`, {
    workflow: workflow.id,
    triggerName: workflow.triggerName,
    triggerPayload: params.triggerPayload || {},
  });
  return id;
}

/**
 * Execute every step in the workflow definition. Stops on failure or pause.
 */
async function runWorkflow(
  workflow: WorkflowDefinition,
  workflowRunId: number,
  params: WorkflowRunParams,
): Promise<WorkflowRun> {
  const { organizationId } = params;
  const ctx: WorkflowContext = {
    workflowRunId,
    organizationId,
    userId: params.userId,
    triggerPayload: params.triggerPayload || {},
    results: {},
  };

  const records: StepRecord[] = [];
  await persistRun(workflowRunId, organizationId, "running", 0, records);
  await logWorkflowAudit(
    organizationId,
    workflowRunId,
    "running",
    `workflow.${workflow.id}.started`,
    {},
  );

  return executeStepLoop(workflow, workflowRunId, params, ctx, records, 0);
}

/**
 * Drive the step loop from `startIndex` to the end, persisting each
 * transition. Shared by runWorkflow (start at 0) and resumeWorkflow
 * (start after the gating step). Stops on failure or pause.
 */
async function executeStepLoop(
  workflow: WorkflowDefinition,
  workflowRunId: number,
  params: WorkflowRunParams,
  ctx: WorkflowContext,
  records: StepRecord[],
  startIndex: number,
): Promise<WorkflowRun> {
  const { organizationId } = params;

  // Build a map for branching by step id
  const stepIndex = new Map<string, number>();
  workflow.steps.forEach((s, i) => stepIndex.set(s.id, i));

  let i = startIndex;
  while (i < workflow.steps.length) {
    const step = workflow.steps[i];
    const startedAt = new Date().toISOString();
    const record: StepRecord = { stepId: step.id, status: "running", startedAt };
    records.push(record);
    await logWorkflowAudit(
      organizationId,
      workflowRunId,
      "step_running",
      `workflow.${workflow.id}.step.${step.id}`,
      {
        description: step.description,
        agent: step.agent,
      },
    );

    let outcome;
    try {
      outcome = await step.handler(ctx);
    } catch (e) {
      outcome = { type: "fail" as const, error: e instanceof Error ? e.message : String(e) };
    }
    record.completedAt = new Date().toISOString();

    if (outcome.type === "ok") {
      record.status = "completed";
      record.output = outcome.output;
      ctx.results[step.id] = outcome.output;
      await logWorkflowAudit(
        organizationId,
        workflowRunId,
        "step_completed",
        `workflow.${workflow.id}.step.${step.id}`,
        {
          agent: step.agent,
        },
      );
      i += 1;
    } else if (outcome.type === "skip") {
      record.status = "skipped";
      record.output = { reason: outcome.reason };
      await logWorkflowAudit(
        organizationId,
        workflowRunId,
        "step_skipped",
        `workflow.${workflow.id}.step.${step.id}`,
        {
          reason: outcome.reason,
        },
      );
      i += 1;
    } else if (outcome.type === "branch") {
      const target = stepIndex.get(outcome.gotoStepId);
      if (target == null) {
        record.status = "failed";
        record.error = `Branch target "${outcome.gotoStepId}" not found`;
        await logWorkflowAudit(
          organizationId,
          workflowRunId,
          "step_failed",
          `workflow.${workflow.id}.step.${step.id}`,
          {
            error: record.error,
          },
        );
        await persistRun(workflowRunId, organizationId, "failed", i, records, record.error);
        return buildRun(workflow, workflowRunId, params, "failed", i, records, record.error);
      }
      record.status = "completed";
      record.output = { branched_to: outcome.gotoStepId };
      await logWorkflowAudit(
        organizationId,
        workflowRunId,
        "step_branched",
        `workflow.${workflow.id}.step.${step.id}`,
        {
          gotoStepId: outcome.gotoStepId,
        },
      );
      i = target;
    } else if (outcome.type === "pause") {
      record.status = "completed"; // the step did its job by pausing
      record.output = { paused: true, reason: outcome.reason };
      await logWorkflowAudit(
        organizationId,
        workflowRunId,
        "awaiting_approval",
        `workflow.${workflow.id}.step.${step.id}`,
        {
          reason: outcome.reason,
        },
      );
      await persistRun(workflowRunId, organizationId, "awaiting_approval", i, records);
      return buildRun(workflow, workflowRunId, params, "awaiting_approval", i, records);
    } else {
      record.status = "failed";
      record.error = outcome.error;
      await logWorkflowAudit(
        organizationId,
        workflowRunId,
        "step_failed",
        `workflow.${workflow.id}.step.${step.id}`,
        {
          error: outcome.error,
        },
      );
      await persistRun(workflowRunId, organizationId, "failed", i, records, outcome.error);
      return buildRun(workflow, workflowRunId, params, "failed", i, records, outcome.error);
    }
    await persistRun(workflowRunId, organizationId, "running", i, records);
  }

  await persistRun(workflowRunId, organizationId, "completed", workflow.steps.length, records);
  await logWorkflowAudit(
    organizationId,
    workflowRunId,
    "completed",
    `workflow.${workflow.id}.completed`,
    {},
  );
  return buildRun(workflow, workflowRunId, params, "completed", workflow.steps.length, records);
}

/**
 * In-memory WorkflowRun construction so callers don't pay a DB roundtrip
 * after the orchestrator has already accumulated the data.
 */
function buildRun(
  workflow: WorkflowDefinition,
  workflowRunId: number,
  params: WorkflowRunParams,
  state: WorkflowRunState,
  currentStep: number,
  records: StepRecord[],
  error?: string,
): WorkflowRun {
  return {
    id: workflowRunId,
    organizationId: params.organizationId,
    workflowType: workflow.id,
    triggerName: workflow.triggerName,
    triggerPayload: params.triggerPayload || {},
    state,
    currentStep,
    results: records,
    error,
    startedBy: params.userId,
    createdAt: new Date().toISOString(),
    completedAt: ["completed", "failed", "cancelled"].includes(state)
      ? new Date().toISOString()
      : undefined,
  };
}

/**
 * Convenience: create + immediately run.
 */
async function startWorkflow(
  workflow: WorkflowDefinition,
  params: WorkflowRunParams,
): Promise<WorkflowRun> {
  const id = await createRun(workflow, params);
  return runWorkflow(workflow, id, params);
}

/**
 * Resume a run that is paused in 'awaiting_approval'.
 *
 * Loads the run, resolves its definition from the registry, rebuilds the
 * step context from the persisted step records, and re-enters the step loop
 * AFTER the gating step (currentStep + 1) — driving the run to completion (or
 * the next pause/failure). Returns null if the run is unknown, and the run
 * unchanged if it is not awaiting approval or its definition is unregistered.
 *
 * @param runId        the ai_workflow_runs row to resume
 * @param approvalId   the approval whose resolution triggered the resume
 *                     (recorded in the resume audit entry)
 * @param organizationId tenant scope
 */
async function resumeWorkflow(
  runId: number,
  approvalId: string | null,
  organizationId: number,
): Promise<WorkflowRun | null> {
  const run = await loadRun(runId, organizationId);
  if (!run) return null;
  if (run.state !== "awaiting_approval") return run;

  const workflow = getWorkflow(run.workflowType);
  if (!workflow) {
    logger.error(
      `[workflow] cannot resume run ${runId}: definition "${run.workflowType}" not registered`,
    );
    return run;
  }

  // Rebuild the per-step results map from the persisted step records so
  // downstream steps see the outputs produced before the pause.
  const records: StepRecord[] = Array.isArray(run.results) ? run.results : [];
  const results: Record<string, unknown> = {};
  for (const r of records) {
    if (r.status === "completed" || r.status === "skipped") {
      results[r.stepId] = r.output;
    }
  }

  const params: WorkflowRunParams = {
    organizationId,
    userId: run.startedBy,
    triggerPayload: run.triggerPayload || {},
  };
  const ctx: WorkflowContext = {
    workflowRunId: runId,
    organizationId,
    userId: run.startedBy,
    triggerPayload: run.triggerPayload || {},
    results,
  };

  await persistRun(runId, organizationId, "running", run.currentStep, records);
  await logWorkflowAudit(organizationId, runId, "running", `workflow.${workflow.id}.resumed`, {
    approvalId,
    fromStep: run.currentStep,
  });

  // The gating step at run.currentStep already did its job by pausing;
  // continue from the next step.
  return executeStepLoop(workflow, runId, params, ctx, records, run.currentStep + 1);
}

async function loadRun(id: number, organizationId: number): Promise<WorkflowRun | null> {
  const rows = (await sequelize.query(
    `SELECT id, organization_id, workflow_type, trigger_name, trigger_payload,
            state, current_step, results, error, started_by, created_at, completed_at
       FROM ai_workflow_runs
      WHERE id = :id AND organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<Record<string, any>>;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowType: row.workflow_type,
    triggerName: row.trigger_name,
    triggerPayload: row.trigger_payload || {},
    state: row.state,
    currentStep: row.current_step,
    results: row.results || [],
    error: row.error || undefined,
    startedBy: row.started_by ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
  };
}

async function listRuns(
  organizationId: number,
  filters?: { workflowType?: string; state?: WorkflowRunState; limit?: number; offset?: number },
): Promise<{ rows: WorkflowRun[]; total: number }> {
  const limit = Math.min(filters?.limit ?? 25, 100);
  const offset = filters?.offset ?? 0;
  const where = ["organization_id = :organizationId"];
  const replacements: Record<string, unknown> = { organizationId, limit, offset };
  if (filters?.workflowType) {
    where.push("workflow_type = :workflowType");
    replacements.workflowType = filters.workflowType;
  }
  if (filters?.state) {
    where.push("state = :state");
    replacements.state = filters.state;
  }
  const whereClause = where.join(" AND ");
  const rows = (await sequelize.query(
    `SELECT id, organization_id, workflow_type, trigger_name, trigger_payload,
            state, current_step, results, error, started_by, created_at, completed_at
       FROM ai_workflow_runs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT },
  )) as Array<Record<string, any>>;
  const total = (await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM ai_workflow_runs WHERE ${whereClause}`,
    { replacements, type: QueryTypes.SELECT },
  )) as Array<{ c: number }>;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      workflowType: r.workflow_type,
      triggerName: r.trigger_name,
      triggerPayload: r.trigger_payload || {},
      state: r.state,
      currentStep: r.current_step,
      results: r.results || [],
      error: r.error || undefined,
      startedBy: r.started_by ?? undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
    })),
    total: total[0]?.c ?? 0,
  };
}

async function cancelRun(id: number, organizationId: number): Promise<void> {
  await sequelize.query(
    `UPDATE ai_workflow_runs
        SET state = 'cancelled', completed_at = NOW()
      WHERE id = :id AND organization_id = :organizationId
        AND state IN ('pending', 'running', 'awaiting_approval')`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.UPDATE,
    },
  );
  await logWorkflowAudit(organizationId, id, "cancelled", "workflow.cancelled", {});
}

export {
  logWorkflowAudit,
  persistRun,
  createRun,
  runWorkflow,
  startWorkflow,
  resumeWorkflow,
  loadRun,
  listRuns,
  cancelRun,
};
