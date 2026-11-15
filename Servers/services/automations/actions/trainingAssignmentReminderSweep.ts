import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  findTrainingRemindersDueQuery,
  markTrainingReminderSentQuery,
} from "../../../utils/trainingAssignment.utils";
import { notifyTrainingReminder } from "../../inAppNotification.service";
import logger from "../../../utils/logger/fileLogger";

/**
 * Daily training reminder sweep (#5260).
 *
 * Tells each person about an open assignment once when it comes within seven
 * days of its due date, and once when it goes overdue. The matching
 * *_reminded_at column is stamped after a successful send, so a failed send
 * retries the next day. One person's failure does not stop the rest, and one
 * organization's failure does not stop the others.
 */

export interface TrainingReminderSweepSummary {
  organization_id: number;
  candidates: number;
  notified: number;
}

export async function runTrainingAssignmentReminderSweep(
  organizationId: number,
): Promise<TrainingReminderSweepSummary> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const reminders = await findTrainingRemindersDueQuery(organizationId);

  let notified = 0;
  for (const reminder of reminders) {
    try {
      await notifyTrainingReminder(
        organizationId,
        Number(reminder.user_id),
        { id: reminder.training_id, name: reminder.training_name, dueDate: reminder.due_date },
        reminder.kind,
        baseUrl,
      );
      await markTrainingReminderSentQuery(reminder.id, reminder.kind, organizationId);
      notified += 1;
    } catch (error) {
      logger.error(
        `❌ Training reminder failed for assignment ${reminder.id} (org ${organizationId}):`,
        error,
      );
    }
  }

  return { organization_id: organizationId, candidates: reminders.length, notified };
}

/** BullMQ entry point: every organization, each isolated from the others. */
export async function runTrainingAssignmentReminderSweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runTrainingAssignmentReminderSweep(org.id);
      if (summary.candidates > 0) {
        logger.info(
          `Training reminder sweep org ${org.id}: candidates=${summary.candidates} notified=${summary.notified}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Training reminder sweep failed for org ${org.id}:`, error);
    }
  }
}
