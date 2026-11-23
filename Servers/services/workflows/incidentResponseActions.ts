/**
 * The incident_response workflow's reads and writes (issue 3813).
 *
 * - loadIncidentForResponse: the run's incident, read directly by id in the
 *   run's organization.
 * - createRemediationTask: one remediation task for the incident's owner.
 * - notifyAdminsOfCriticalIncident: an in-app notice and an email to every
 *   Admin of the organization.
 *
 * Both writes run on the post-approval resume of their gated step and do
 * their work once per run, even when the step runs again:
 * - the task is created on a transaction that holds the run's row, and its id
 *   is stored on that row (ai_workflow_runs.trigger_payload._effects), which
 *   the engine never rewrites and data retention never prunes;
 * - each Admin's notice row is the claim for that Admin: inserted under the
 *   run's row lock, delivered (real-time publish and email) after commit, and
 *   marked `sent` only once delivery was attempted without error.
 * No transaction here waits on a second pooled connection while it holds a
 * lock: every query inside one runs on that transaction.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { getIncidentByIdQuery } from "../../utils/incidentManagement.utils";
import { createNotificationQuery } from "../../utils/notification.utils";
import { createNewTaskQuery } from "../../utils/task.utils";
import { recordEntityCreation } from "../../utils/changeHistory.base.utils";
import { incidentPagePath } from "../../utils/incidentLinks.utils";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../domain.layer/enums/task-status.enum";
import { ADMIN_ROLE_ID } from "../../constants/roles";
import {
  buildCriticalIncidentEscalation,
  CRITICAL_INCIDENT_ESCALATION_ACTION,
  CriticalIncidentEscalation,
  notifyTaskAssigned,
  publishInAppNotification,
} from "../inAppNotification.service";
import { notificationService } from "../notificationService";
import { WorkflowContext } from "./types";

/**
 * A notice claimed this recently and not yet sent is being delivered by
 * another execution of the step; an older unsent claim is delivered again.
 */
export const ESCALATION_CLAIM_LEASE_MINUTES = 5;

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
  archived: boolean;
}

const frontendUrl = (): string => process.env.FRONTEND_URL || "http://localhost:5173";

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
    archived: data.archived === true,
  };
}

/**
 * Runs `work` in a transaction that holds the run's row
 * (FOR NO KEY UPDATE): a second execution of the same step for the same run
 * waits here, then sees what the first one recorded. `work` must run every
 * query on the transaction it is given.
 */
async function withRunLock<T>(
  ctx: WorkflowContext,
  work: (transaction: Transaction, payload: Record<string, any>) => Promise<T>,
): Promise<T> {
  return sequelize.transaction(async (transaction) => {
    const rows = (await sequelize.query(
      `SELECT trigger_payload FROM ai_workflow_runs
        WHERE id = :runId AND organization_id = :organizationId
        FOR NO KEY UPDATE`,
      {
        replacements: { runId: ctx.workflowRunId, organizationId: ctx.organizationId },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as Array<{ trigger_payload: Record<string, any> | null }>;
    return work(transaction, rows[0]?.trigger_payload ?? {});
  });
}

/** Of `candidates`, the ids that are members of the organization. */
async function organizationMembers(
  organizationId: number,
  candidates: number[],
  transaction: Transaction,
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

/** The organization's Admins, lowest id first. */
async function organizationAdmins(
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const rows = (await sequelize.query(
    `SELECT user_id FROM organization_members
      WHERE organization_id = :organizationId AND role_id = :adminRoleId
      ORDER BY user_id`,
    {
      replacements: { organizationId, adminRoleId: ADMIN_ROLE_ID },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ user_id: number }>;
  return rows.map((r) => Number(r.user_id));
}

/**
 * The user who created the incident, from its creation history. Data
 * retention prunes old history, so this may be null for an old incident;
 * the caller then falls through to the next candidate.
 */
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

/** The user who approved the gate this resume runs for. */
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
 * Who the remediation task is for, and who creates it.
 *
 * Assignee: the incident's owner; when it has none (or the owner has left the
 * organization), the user who created the incident; failing that, the Admin
 * who approved the task. Only current members of the organization qualify;
 * null when none does.
 *
 * Creator (tasks.creator_id, never null when anyone can be found): the
 * approving user, else the assignee, else the organization's first Admin.
 */
export async function resolveRemediationPeople(
  ctx: WorkflowContext,
  incident: ResponseIncident,
  transaction: Transaction,
): Promise<{
  assigneeId: number | null;
  source: string;
  creatorId: number | null;
}> {
  const approverId = await gateApproverId(ctx, transaction);
  const creatorOfIncident = await incidentCreatorId(ctx.organizationId, incident.id, transaction);
  const ordered: Array<[number | null, string]> = [
    [incident.assigneeId, "owner"],
    [creatorOfIncident, "creator"],
    [approverId, "approver"],
  ];
  const ids = ordered.map(([id]) => id).filter((id): id is number => id !== null);
  const members = await organizationMembers(ctx.organizationId, ids, transaction);
  const match = ordered.find(([id]) => id !== null && members.has(id));
  const assigneeId = match ? match[0] : null;
  const creatorId =
    approverId ??
    assigneeId ??
    (await organizationAdmins(ctx.organizationId, transaction))[0] ??
    null;
  return { assigneeId, source: match ? match[1] : "none", creatorId };
}

async function fullName(userId: number): Promise<string | null> {
  const rows = (await sequelize.query(
    `SELECT TRIM(CONCAT_WS(' ', name, surname)) AS full_name FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  )) as Array<{ full_name: string | null }>;
  return rows[0]?.full_name || null;
}

/** The record of the run's remediation task, kept on the run row. */
interface RemediationTaskEffect {
  taskId: number;
  assigneeId: number | null;
  assigneeSource: string;
}

export interface RemediationTaskOutcome extends RemediationTaskEffect {
  /** true when this execution found the run's task already created. */
  alreadyCreated: boolean;
}

/**
 * Creates the run's one remediation task (High priority, Open), assigned and
 * created per resolveRemediationPeople, and recorded in task history as a
 * system change. In the same transaction, the task is recorded on the run
 * row (trigger_payload._effects.remediation_task); a later execution for the
 * same run returns that task instead of creating another. The assignee is
 * told (in-app and email) after commit, only when the task is new.
 */
export async function createRemediationTask(
  ctx: WorkflowContext,
  incident: ResponseIncident,
): Promise<RemediationTaskOutcome> {
  const outcome = await withRunLock(ctx, async (transaction, payload) => {
    const recorded = payload?._effects?.remediation_task as RemediationTaskEffect | undefined;
    if (recorded && Number(recorded.taskId) > 0) {
      return {
        effect: recorded,
        alreadyCreated: true,
        creatorId: null as number | null,
        title: "",
        description: "",
      };
    }

    const { assigneeId, source, creatorId } = await resolveRemediationPeople(
      ctx,
      incident,
      transaction,
    );
    const title = `Respond to critical incident ${incident.reference}`;
    const description =
      `Incident ${incident.reference} in "${incident.useCase}" was rated ${incident.severity}` +
      (incident.type ? ` (${incident.type})` : "") +
      `. Investigate it, contain the harm and record the mitigations and corrective actions on ` +
      `the incident: ${frontendUrl()}${incidentPagePath(incident.id)}\n\n` +
      `Created by the critical incident response workflow.`;
    const task = await createNewTaskQuery(
      {
        title,
        description,
        // Null only for an organization without a single Admin.
        creator_id: creatorId as number,
        priority: TaskPriority.HIGH,
        status: TaskStatus.OPEN,
        categories: [],
      },
      ctx.organizationId,
      transaction,
      assigneeId !== null ? [{ user_id: assigneeId }] : [],
    );
    const effect: RemediationTaskEffect = {
      taskId: Number(task.id),
      assigneeId,
      assigneeSource: source,
    };
    await recordEntityCreation(
      "task",
      effect.taskId,
      null,
      ctx.organizationId,
      { title, description, priority: TaskPriority.HIGH, status: TaskStatus.OPEN },
      transaction,
      true,
    );
    await sequelize.query(
      `UPDATE ai_workflow_runs
          SET trigger_payload = trigger_payload || jsonb_build_object(
                '_effects',
                COALESCE(trigger_payload->'_effects', '{}'::jsonb)
                  || jsonb_build_object('remediation_task', CAST(:effect AS jsonb)))
        WHERE id = :runId AND organization_id = :organizationId`,
      {
        replacements: {
          effect: JSON.stringify(effect),
          runId: ctx.workflowRunId,
          organizationId: ctx.organizationId,
        },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
    return { effect, alreadyCreated: false, creatorId, title, description };
  });

  const { effect } = outcome;
  if (!outcome.alreadyCreated && effect.assigneeId !== null) {
    const assigneeId = effect.assigneeId;
    try {
      const assignerName =
        (outcome.creatorId !== null ? await fullName(outcome.creatorId) : null) ?? "VerifyWise";
      await notifyTaskAssigned(
        ctx.organizationId,
        assigneeId,
        {
          id: effect.taskId,
          title: outcome.title,
          description: outcome.description,
          priority: TaskPriority.HIGH,
        },
        assignerName,
        frontendUrl(),
      );
    } catch (error) {
      logger.error(
        `[workflow] incident_response: task ${effect.taskId} assignment notice failed:`,
        error,
      );
    }
  }

  return {
    taskId: Number(effect.taskId),
    assigneeId: effect.assigneeId == null ? null : Number(effect.assigneeId),
    assigneeSource: String(effect.assigneeSource),
    alreadyCreated: outcome.alreadyCreated,
  };
}

export interface AdminEscalationOutcome {
  /** Admins reached by this execution. */
  notified: number[];
  /** Admins an earlier execution already reached. */
  alreadyNotified: number[];
  /** Admins another execution is reaching right now (claimed within the lease). */
  inFlight: number[];
  /** Admins whose delivery failed; their claim stays unsent for a retry. */
  failed: number[];
}

interface EscalationClaim {
  id: number;
  user_id: number;
  sent: boolean;
  claimed_recently: boolean;
}

/**
 * Notifies every Admin of the organization about the critical incident, in
 * the app and by email.
 *
 *   1. Builds each Admin's notice (language, address) with no lock held.
 *   2. Under the run's row lock, on one transaction: reads this run's notice
 *      rows, inserts one (unsent) for each Admin without one, and claims every
 *      unsent row not claimed within ESCALATION_CLAIM_LEASE_MINUTES. Commit.
 *   3. After commit, delivers each claimed row (real-time publish, then the
 *      email) and marks it sent. A failure leaves it unsent, releases its
 *      claim and is reported in `failed`, so a later execution delivers only
 *      what was missed, straight away.
 */
export async function notifyAdminsOfCriticalIncident(
  ctx: WorkflowContext,
  incident: ResponseIncident,
): Promise<AdminEscalationOutcome> {
  const admins = await organizationAdmins(ctx.organizationId);
  const built = new Map<number, CriticalIncidentEscalation>();
  for (const adminId of admins) {
    built.set(
      adminId,
      await buildCriticalIncidentEscalation(adminId, incident, ctx.workflowRunId, frontendUrl()),
    );
  }

  const outcome: AdminEscalationOutcome = {
    notified: [],
    alreadyNotified: [],
    inFlight: [],
    failed: [],
  };

  const toDeliver = await withRunLock(ctx, async (transaction) => {
    const claims = (await sequelize.query(
      `SELECT id, user_id,
              COALESCE((metadata->>'sent')::boolean, false) AS sent,
              COALESCE((metadata->>'claimed_at')::timestamptz
                         > NOW() - make_interval(mins => :lease), false) AS claimed_recently
         FROM notifications
        WHERE organization_id = :organizationId
          AND metadata->>'workflow_action' = :action
          AND metadata->>'workflow_run_id' = :runId`,
      {
        replacements: {
          organizationId: ctx.organizationId,
          action: CRITICAL_INCIDENT_ESCALATION_ACTION,
          runId: String(ctx.workflowRunId),
          lease: ESCALATION_CLAIM_LEASE_MINUTES,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as EscalationClaim[];
    const byUser = new Map(claims.map((c) => [Number(c.user_id), c]));
    const claimedAt = new Date().toISOString();
    const deliver: Array<{ adminId: number; notificationId: number }> = [];

    for (const adminId of admins) {
      const claim = byUser.get(adminId);
      if (claim?.sent) {
        outcome.alreadyNotified.push(adminId);
        continue;
      }
      if (claim?.claimed_recently) {
        outcome.inFlight.push(adminId);
        continue;
      }
      if (claim) {
        await sequelize.query(
          `UPDATE notifications
              SET metadata = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object('claimed_at', CAST(:claimedAt AS text))
            WHERE id = :id AND organization_id = :organizationId`,
          {
            replacements: { id: claim.id, claimedAt, organizationId: ctx.organizationId },
            type: QueryTypes.UPDATE,
            transaction,
          },
        );
        deliver.push({ adminId, notificationId: Number(claim.id) });
        continue;
      }
      const notice = built.get(adminId)!;
      const stored = await createNotificationQuery(
        {
          ...notice.notification,
          metadata: { ...notice.notification.metadata, sent: false, claimed_at: claimedAt },
        },
        ctx.organizationId,
        transaction,
      );
      deliver.push({ adminId, notificationId: Number(stored.id) });
    }
    return deliver;
  });

  for (const { adminId, notificationId } of toDeliver) {
    const notice = built.get(adminId)!;
    try {
      const rows = (await sequelize.query(
        `SELECT * FROM notifications WHERE id = :id AND organization_id = :organizationId`,
        {
          replacements: { id: notificationId, organizationId: ctx.organizationId },
          type: QueryTypes.SELECT,
        },
      )) as any[];
      if (rows[0]) await publishInAppNotification(ctx.organizationId, rows[0]);
      if (notice.email.to) {
        await notificationService.sendEmailWithTemplate(
          notice.email.to,
          notice.email.subject,
          notice.email.template,
          notice.email.variables,
        );
      }
      await sequelize.query(
        `UPDATE notifications
            SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"sent": true}'::jsonb
          WHERE id = :id AND organization_id = :organizationId`,
        {
          replacements: { id: notificationId, organizationId: ctx.organizationId },
          type: QueryTypes.UPDATE,
        },
      );
      outcome.notified.push(adminId);
    } catch (error) {
      logger.error(
        `[workflow] incident_response: escalation notice to admin ${adminId} failed:`,
        error,
      );
      outcome.failed.push(adminId);
      // Release the claim, so a retry (the step's retry approval) delivers
      // it at once instead of waiting out the lease.
      await sequelize
        .query(
          `UPDATE notifications SET metadata = metadata - 'claimed_at'
            WHERE id = :id AND organization_id = :organizationId`,
          {
            replacements: { id: notificationId, organizationId: ctx.organizationId },
            type: QueryTypes.UPDATE,
          },
        )
        .catch((releaseError) =>
          logger.error(
            `[workflow] could not release escalation claim ${notificationId}:`,
            releaseError,
          ),
        );
    }
  }
  return outcome;
}
