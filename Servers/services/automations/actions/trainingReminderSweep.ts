import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  ITrainingAssignmentRecipient,
  assignmentsDueForReminderQuery,
  computeOverdueAssignmentsQuery,
  emptyGroupAssignmentsQuery,
  stampAssignmentRemindedQuery,
} from "../../../utils/trainingAssignment.utils";
import { notifyTrainingAssigned } from "../../inAppNotification.service";
import logger from "../../../utils/logger/fileLogger";

/**
 * Daily training reminder sweep (#5260).
 *
 * Two passes per org:
 *  1. Flip pending assignments whose due date passed to overdue.
 *  2. Email every assignee (user assignments directly, group assignments
 *     through group_members) whose training is due within 7 days or
 *     overdue, at most once every 3 days. last_reminded_at is stamped
 *     only after a successful send, so a failed send retries tomorrow.
 *     Group assignments with no members are skipped and logged.
 */

export interface TrainingReminderSweepSummary {
  organization_id: number;
  overdue_marked: number;
  candidates: number;
  notified: number;
  skipped_empty_groups: number;
}

const formatDueDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
};

export async function runTrainingReminderSweep(
  organizationId: number,
): Promise<TrainingReminderSweepSummary> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  const overdueIds = await computeOverdueAssignmentsQuery(organizationId);
  if (overdueIds.length > 0) {
    logger.info(
      `Training reminder sweep org ${organizationId}: marked ${overdueIds.length} assignments overdue`,
    );
  }

  const [recipients, emptyGroups] = await Promise.all([
    assignmentsDueForReminderQuery(organizationId),
    emptyGroupAssignmentsQuery(organizationId),
  ]);

  // A user can hold several assignments for the same training (directly
  // and via groups): one email per (user, training), first assignment wins.
  const seen = new Set<string>();
  const unique: ITrainingAssignmentRecipient[] = [];
  for (const row of recipients) {
    const key = `${row.user_id}:${row.training_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  const assignerIds = Array.from(
    new Set(unique.map((r) => r.assigned_by).filter((id): id is number => id !== null)),
  );
  const assigners = assignerIds.length
    ? ((await sequelize.query(`SELECT id, name, surname FROM users WHERE id IN (:assignerIds)`, {
        replacements: { assignerIds },
        type: QueryTypes.SELECT,
      })) as Array<{ id: number; name: string; surname: string }>)
    : [];
  const assignerNameById = new Map(assigners.map((a) => [a.id, `${a.name} ${a.surname}`]));

  let notified = 0;
  for (const row of unique) {
    try {
      const assignerName = row.assigned_by
        ? (assignerNameById.get(row.assigned_by) ?? "Your organization")
        : "Your organization";

      await notifyTrainingAssigned(
        organizationId,
        row.user_id,
        {
          id: row.training_id,
          name: row.training_name,
          description: row.training_description ?? undefined,
          duration: row.training_duration ?? undefined,
          dueDate: formatDueDate(row.due_date),
        },
        assignerName,
        baseUrl,
      );
      await stampAssignmentRemindedQuery(row.assignment_id);
      notified += 1;
    } catch (error) {
      // Not stamped: tomorrow's run retries the send.
      logger.error(
        `❌ Training reminder failed for assignment ${row.assignment_id} (org ${organizationId}):`,
        error,
      );
    }
  }

  for (const skipped of emptyGroups) {
    logger.warn(
      `Training reminder sweep org ${organizationId}: skipping group assignment ${skipped.assignment_id} (group ${skipped.subject_id}, training ${skipped.training_id}) — group has no members`,
    );
  }

  return {
    organization_id: organizationId,
    overdue_marked: overdueIds.length,
    candidates: unique.length,
    notified,
    skipped_empty_groups: emptyGroups.length,
  };
}

/** BullMQ entry point: every org, each isolated. */
export async function runTrainingReminderSweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runTrainingReminderSweep(org.id);
      if (summary.candidates > 0 || summary.overdue_marked > 0) {
        logger.info(
          `Training reminder sweep org ${org.id}: overdue=${summary.overdue_marked} candidates=${summary.candidates} notified=${summary.notified} empty_groups=${summary.skipped_empty_groups}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Training reminder sweep failed for org ${org.id}:`, error);
    }
  }
}
