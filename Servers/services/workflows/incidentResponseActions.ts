/**
 * The incident_response workflow's reads and writes (issue 3813).
 *
 * - loadIncidentForResponse: the run's incident, read directly by id in the
 *   run's organization.
 * - createRemediationTask: one remediation task for the incident's owner.
 * - notifyAdminsOfCriticalIncident: an in-app notice and an email to every
 *   Admin of the organization.
 *
 * Both writes run on the post-approval resume of their gated step. Each holds
 * a lock on the run's row while it checks for and records its own work, so a
 * step that runs again for the same run (a second resume, a retry) does not
 * create a second task or notify an Admin twice.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { getIncidentByIdQuery } from "../../utils/incidentManagement.utils";
import { createNewTaskQuery } from "../../utils/task.utils";
import { recordEntityCreation } from "../../utils/changeHistory.base.utils";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../domain.layer/enums/task-status.enum";
import {
  CRITICAL_INCIDENT_ESCALATION_ACTION,
  notifyCriticalIncidentEscalation,
  notifyTaskAssigned,
} from "../inAppNotification.service";
import { WorkflowContext } from "./types";

const ADMIN_ROLE_ID = 1;

/** Audit rule that records the remediation task a run created. */
export const REMEDIATION_TASK_CREATED_RULE = "workflow.incident_response.remediation_task_created";

/** The incident fields the workflow uses. */
export interface ResponseIncident {
  id: number;
  /** The incident's display id (incident_id), or "#<id>" when it has none. */
  reference: string;
  useCase: string;
  severity: string;
  type: string;
  assigneeId: number | null;
  ownerName: string | null;
}

const frontendUrl = (): string => process.env.FRONTEND_URL || "http://localhost:5173";

export const incidentPath = (incidentId: number): string =>
  `/ai-incident-managements?incidentId=${incidentId}`;

/**
 * Loads one incident by id in the organization, or null when it does not
 * exist there (deleted, or another organization's).
 */
export async function loadIncidentForResponse(
  organizationId: number,
  incidentId: number,
): Promise<ResponseIncident | null> {
  if (!Number.isInteger(incidentId) || incidentId <= 0) return null;
  const row = await getIncidentByIdQuery(incidentId, organizationId);
  if (!row) return null;
  const data = ((row as { dataValues?: unknown }).dataValues ?? row) as Record<string, unknown>;
  const assigneeId = Number(data.assignee_id);
  const ownerName = typeof data.assignee_name === "string" ? data.assignee_name.trim() : "";
  return {
    id: Number(data.id),
    reference:
      typeof data.incident_id === "string" && data.incident_id.trim() !== ""
        ? data.incident_id
        : `#${data.id}`,
    useCase: String(data.ai_project ?? ""),
    severity: String(data.severity ?? ""),
    type: String(data.type ?? ""),
    assigneeId: Number.isInteger(assigneeId) && assigneeId > 0 ? assigneeId : null,
    ownerName: ownerName || null,
  };
}

/**
 * Runs `work` in a transaction that holds the run's row
 * (FOR NO KEY UPDATE): a second execution of the same step for the same run
 * waits here, then sees what the first one recorded.
 */
async function withRunLock<T>(
  ctx: WorkflowContext,
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `SELECT id FROM ai_workflow_runs
        WHERE id = :runId AND organization_id = :organizationId
        FOR NO KEY UPDATE`,
      {
        replacements: { runId: ctx.workflowRunId, organizationId: ctx.organizationId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return work(transaction);
  });
}

/** Of `candidates`, the ids that are members of the organization. */
async function organizationMembers(
  organizationId: number,
  candidates: number[],
  transaction?: Transaction,
): Promise<Set<number>> {
  if (candidates.length === 0) return new Set();
  const rows = (await sequelize.query(
    `SELECT user_id FROM organization_members
      WHERE organization_id = :organizationId AND user_id IN (:ids)`,
    {
      replacements: { organizationId, ids: candidates },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ user_id: number }>;
  return new Set(rows.map((r) => Number(r.user_id)));
}

/** The user who created the incident, from its creation history. */
async function incidentCreatorId(
  organizationId: number,
  incidentId: number,
  transaction: Transaction,
): Promise<number | null> {
  const rows = (await sequelize.query(
    `SELECT changed_by_user_id FROM incident_change_history
      WHERE organization_id = :organizationId AND incident_id = :incidentId
        AND action = 'created' AND changed_by_user_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1`,
    { replacements: { organizationId, incidentId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ changed_by_user_id: number }>;
  return rows[0] ? Number(rows[0].changed_by_user_id) : null;
}

/** The Admin who approved the gate this resume runs for. */
async function gateApproverId(
  ctx: WorkflowContext,
  transaction: Transaction,
): Promise<number | null> {
  if (!ctx.resumedApprovalId) return null;
  const rows = (await sequelize.query(
    `SELECT approved_by FROM ai_action_approvals
      WHERE id = :approvalId AND organization_id = :organizationId`,
    {
      replacements: { approvalId: ctx.resumedApprovalId, organizationId: ctx.organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ approved_by: number | null }>;
  const id = Number(rows[0]?.approved_by);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Who the remediation task is for: the incident's owner; when it has none
 * (or the owner has left the organization), the user who created the
 * incident; failing that, the Admin who approved the task. Only current
 * members of the organization qualify. null when none does.
 */
export async function resolveRemediationAssignee(
  ctx: WorkflowContext,
  incident: ResponseIncident,
  transaction: Transaction,
): Promise<{ assigneeId: number | null; approverId: number | null; source: string }> {
  const approverId = await gateApproverId(ctx, transaction);
  const creatorId = await incidentCreatorId(ctx.organizationId, incident.id, transaction);
  const ordered: Array<[number | null, string]> = [
    [incident.assigneeId, "owner"],
    [creatorId, "creator"],
    [approverId, "approver"],
  ];
  const ids = ordered.map(([id]) => id).filter((id): id is number => id !== null);
  const members = await organizationMembers(ctx.organizationId, ids, transaction);
  const match = ordered.find(([id]) => id !== null && members.has(id));
  return {
    assigneeId: match ? match[0] : null,
    approverId: approverId !== null && members.has(approverId) ? approverId : null,
    source: match ? match[1] : "none",
  };
}

async function fullName(userId: number): Promise<string | null> {
  const rows = (await sequelize.query(
    `SELECT TRIM(CONCAT_WS(' ', name, surname)) AS full_name FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  )) as Array<{ full_name: string | null }>;
  return rows[0]?.full_name || null;
}

export interface RemediationTaskOutcome {
  taskId: number;
  assigneeId: number | null;
  assigneeSource: string;
  /** true when this execution found the run's task already created. */
  alreadyCreated: boolean;
}

/**
 * Creates the run's one remediation task (High priority, Open), assigned per
 * resolveRemediationAssignee, created by the approving Admin, and recorded in
 * task history as a system change. The task id is recorded in
 * ai_action_audit_log in the same transaction; a later execution for the same
 * run returns that task instead of creating another. The assignee is told
 * (in-app and email) after commit, only when the task is new.
 */
export async function createRemediationTask(
  ctx: WorkflowContext,
  incident: ResponseIncident,
): Promise<RemediationTaskOutcome> {
  const outcome = await withRunLock(ctx, async (transaction) => {
    const recorded = (await sequelize.query(
      `SELECT metadata FROM ai_action_audit_log
        WHERE organization_id = :organizationId AND workflow_run_id = :runId
          AND rule_name = :rule
        LIMIT 1`,
      {
        replacements: {
          organizationId: ctx.organizationId,
          runId: ctx.workflowRunId,
          rule: REMEDIATION_TASK_CREATED_RULE,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as Array<{ metadata: Record<string, unknown> | null }>;
    if (recorded[0]) {
      const meta = recorded[0].metadata ?? {};
      return {
        taskId: Number(meta.taskId),
        assigneeId: meta.assigneeId == null ? null : Number(meta.assigneeId),
        assigneeSource: String(meta.assigneeSource ?? "unknown"),
        alreadyCreated: true,
        approverId: null as number | null,
        title: "",
        description: "",
      };
    }

    const { assigneeId, approverId, source } = await resolveRemediationAssignee(
      ctx,
      incident,
      transaction,
    );
    const title = `Respond to critical incident ${incident.reference}`;
    const description =
      `Incident ${incident.reference} in "${incident.useCase}" was rated ${incident.severity}` +
      (incident.type ? ` (${incident.type})` : "") +
      `. Investigate it, contain the harm and record the mitigations and corrective actions on ` +
      `the incident: ${frontendUrl()}${incidentPath(incident.id)}\n\n` +
      `Created by the critical incident response workflow.`;
    const task = await createNewTaskQuery(
      {
        title,
        description,
        // The approving Admin; the raw insert accepts null when none is known.
        creator_id: (approverId ?? assigneeId) as number,
        priority: TaskPriority.HIGH,
        status: TaskStatus.OPEN,
        categories: [],
      },
      ctx.organizationId,
      transaction,
      assigneeId !== null ? [{ user_id: assigneeId }] : [],
    );
    const taskId = Number(task.id);
    await recordEntityCreation(
      "task",
      taskId,
      null,
      ctx.organizationId,
      { title, description, priority: TaskPriority.HIGH, status: TaskStatus.OPEN },
      transaction,
      true,
    );
    await sequelize.query(
      `INSERT INTO ai_action_audit_log
         (organization_id, action_approval_id, workflow_run_id, from_state, to_state,
          actor_type, actor_id, rule_name, metadata, created_at)
       VALUES
         (:organizationId, :approvalId, :runId, NULL, 'task_created',
          'system', :actorId, :rule, :metadata::jsonb, NOW())`,
      {
        replacements: {
          organizationId: ctx.organizationId,
          approvalId: ctx.resumedApprovalId ?? null,
          runId: ctx.workflowRunId,
          actorId: approverId,
          rule: REMEDIATION_TASK_CREATED_RULE,
          metadata: JSON.stringify({
            taskId,
            incidentId: incident.id,
            assigneeId,
            assigneeSource: source,
          }),
        },
        type: QueryTypes.INSERT,
        transaction,
      },
    );
    return {
      taskId,
      assigneeId,
      assigneeSource: source,
      alreadyCreated: false,
      approverId,
      title,
      description,
    };
  });

  if (!outcome.alreadyCreated && outcome.assigneeId !== null) {
    const assigneeId = outcome.assigneeId;
    try {
      const assignerName =
        (outcome.approverId !== null ? await fullName(outcome.approverId) : null) ?? "VerifyWise";
      await notifyTaskAssigned(
        ctx.organizationId,
        assigneeId,
        {
          id: outcome.taskId,
          title: outcome.title,
          description: outcome.description,
          priority: TaskPriority.HIGH,
        },
        assignerName,
        frontendUrl(),
      );
    } catch (error) {
      logger.error(
        `[workflow] incident_response: task ${outcome.taskId} assignment notice failed:`,
        error,
      );
    }
  }

  return {
    taskId: outcome.taskId,
    assigneeId: outcome.assigneeId,
    assigneeSource: outcome.assigneeSource,
    alreadyCreated: outcome.alreadyCreated,
  };
}

export interface AdminEscalationOutcome {
  notified: number[];
  alreadyNotified: number[];
  failed: number[];
}

/**
 * Notifies every Admin of the organization about the critical incident, in
 * the app and by email (notifyCriticalIncidentEscalation). An Admin who
 * already has this run's notice is skipped, so a second execution for the
 * same run only reaches Admins the first one missed. A failure for one Admin
 * is logged and does not stop the others.
 */
export async function notifyAdminsOfCriticalIncident(
  ctx: WorkflowContext,
  incident: ResponseIncident,
): Promise<AdminEscalationOutcome> {
  return withRunLock(ctx, async (transaction) => {
    const admins = (
      (await sequelize.query(
        `SELECT user_id FROM organization_members
          WHERE organization_id = :organizationId AND role_id = :adminRoleId
          ORDER BY user_id`,
        {
          replacements: { organizationId: ctx.organizationId, adminRoleId: ADMIN_ROLE_ID },
          type: QueryTypes.SELECT,
          transaction,
        },
      )) as Array<{ user_id: number }>
    ).map((r) => Number(r.user_id));

    const done = new Set(
      (
        (await sequelize.query(
          `SELECT DISTINCT user_id FROM notifications
            WHERE organization_id = :organizationId
              AND metadata->>'workflow_action' = :action
              AND metadata->>'workflow_run_id' = :runId`,
          {
            replacements: {
              organizationId: ctx.organizationId,
              action: CRITICAL_INCIDENT_ESCALATION_ACTION,
              runId: String(ctx.workflowRunId),
            },
            type: QueryTypes.SELECT,
            transaction,
          },
        )) as Array<{ user_id: number }>
      ).map((r) => Number(r.user_id)),
    );

    const outcome: AdminEscalationOutcome = { notified: [], alreadyNotified: [], failed: [] };
    for (const adminId of admins) {
      if (done.has(adminId)) {
        outcome.alreadyNotified.push(adminId);
        continue;
      }
      try {
        await notifyCriticalIncidentEscalation(
          ctx.organizationId,
          adminId,
          incident,
          ctx.workflowRunId,
          frontendUrl(),
        );
        outcome.notified.push(adminId);
      } catch (error) {
        logger.error(
          `[workflow] incident_response: escalation notice to admin ${adminId} failed:`,
          error,
        );
        outcome.failed.push(adminId);
      }
    }
    return outcome;
  });
}
