import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  findPolicyRemindersDueQuery,
  markPolicyReminderSentQuery,
  PolicyReminderDue,
} from "../../../utils/policyManager.utils";
import { formatReviewDate } from "../../../utils/policyReviewDate.utils";
import { notifyPolicyReviewReminder } from "../../inAppNotification.service";
import { sendSlackNotification } from "../../slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../../../domain.layer/enums/slack.enum";
import logger from "../../../utils/logger/fileLogger";

/**
 * Daily policy review reminder sweep (P-H3, P-M2). Replaces the old 8 AM email
 * job and the 9 AM Slack job, which reminded only some of the people involved,
 * never about an overdue review, and again every day.
 *
 * Tells a policy's owner and reviewers once when its review date comes within
 * seven days, and once when it passes (recipients are chosen by
 * findPolicyRemindersDueQuery). The in-app notice is the channel of record:
 * the policy's *_reminded_at column is stamped once at least one recipient's
 * in-app notice was stored. Every per-recipient failure is logged; a
 * recipient whose notice fails is not retried, so one broken recipient never
 * makes everyone else hear the reminder again every day. Only a policy that
 * reached nobody stays unstamped and is retried the next day. The stamp also
 * requires the review day the sweep read, so a date changed mid-sweep is not
 * marked reminded. Email and Slack are best-effort: their failures are logged
 * and never block the stamp, so a deployment without email still gets its
 * reminders, once.
 * One policy's failure does not stop the rest, and one organization's failure
 * does not stop the others.
 */

export interface PolicyReviewReminderSweepSummary {
  organization_id: number;
  candidates: number;
  notified: number;
}

/**
 * Same routing and wording as the retired Slack job, for both kinds. With a
 * user: only that user's own Slack connections, once per recipient. With
 * `null`: the organization-wide connections, once per reminder — so a shared
 * channel hears about a policy once, not once per owner and reviewer.
 */
const sendSlackReminder = async (
  organizationId: number,
  userId: number | null,
  reminder: PolicyReminderDue,
): Promise<void> => {
  const date = formatReviewDate(reminder.review_date);
  try {
    await sendSlackNotification(
      {
        organizationId,
        userId,
        ownConnectionsOnly: userId !== null,
        routingType: SlackNotificationRoutingType.POLICY_REMINDERS_AND_STATUS,
      },
      {
        title: "Policy review reminder",
        message:
          reminder.kind === "overdue"
            ? `The review of policy "${reminder.title}" was due on ${date}.`
            : `The review of policy "${reminder.title}" is due on ${date}.`,
      },
    );
  } catch (error) {
    logger.warn(
      `Policy review Slack reminder failed for policy ${reminder.id}, ${
        userId === null ? "organization channels" : `user ${userId}`
      }: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export async function runPolicyReviewReminderSweep(
  organizationId: number,
): Promise<PolicyReviewReminderSweepSummary> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const reminders = await findPolicyRemindersDueQuery(organizationId);

  let notified = 0;
  for (const reminder of reminders) {
    let reached = 0;
    for (const userId of reminder.recipient_ids) {
      try {
        await notifyPolicyReviewReminder(
          organizationId,
          Number(userId),
          { id: reminder.id, title: reminder.title, reviewDate: reminder.review_date },
          reminder.kind,
          baseUrl,
        );
        reached += 1;
      } catch (error) {
        logger.error(
          `❌ Policy review reminder failed for policy ${reminder.id}, user ${userId} (org ${organizationId}):`,
          error,
        );
      }
      await sendSlackReminder(organizationId, Number(userId), reminder);
    }

    if (reached === 0) continue;
    // Organization-wide Slack connections: one post per reminder, only when
    // someone was reached — the same condition as the stamp below, so a
    // reminder that reached nobody (and is retried tomorrow) posts nothing.
    await sendSlackReminder(organizationId, null, reminder);
    try {
      const stamped = await markPolicyReminderSentQuery(
        reminder.id,
        reminder.kind,
        reminder.review_date,
        organizationId,
      );
      if (stamped) notified += 1;
    } catch (error) {
      logger.error(
        `❌ Could not stamp the ${reminder.kind} reminder of policy ${reminder.id} (org ${organizationId}):`,
        error,
      );
    }
  }

  return { organization_id: organizationId, candidates: reminders.length, notified };
}

/** BullMQ entry point: every organization, each isolated from the others. */
export async function runPolicyReviewReminderSweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runPolicyReviewReminderSweep(org.id);
      if (summary.candidates > 0) {
        logger.info(
          `Policy review reminder sweep org ${org.id}: candidates=${summary.candidates} notified=${summary.notified}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Policy review reminder sweep failed for org ${org.id}:`, error);
    }
  }
}
