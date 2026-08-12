import { sendInAppNotification } from "./inAppNotification.service";
import { sendSlackNotification } from "./slack/slackNotificationService";
import { sendTeamsNotification } from "./teams/teamsNotification.service";
import {
  ICreateNotification,
  IEmailNotificationConfig,
} from "../domain.layer/interfaces/i.notification";
import { getAllUsersQuery } from "../utils/user.utils";
import logger from "../utils/logger/fileLogger";

// Admin role id (see JWT roles table). Org-wide proactive alerts are delivered
// to the org's admins.
const ADMIN_ROLE_ID = 1;

/**
 * Resolve the concrete in-app recipients for a proactive notification. These
 * alerts are org-wide with no single owner, so the caller passes a falsy
 * user_id as a "broadcast" marker; we expand it to one notification per org
 * admin. notifications.user_id is NOT NULL REFERENCES users(id), so a real id
 * is required — a literal 0 would raise a foreign-key violation.
 *
 * When the notification already targets a real user (user_id > 0) it is passed
 * through unchanged.
 */
async function resolveInAppRecipients(
  organizationId: number,
  notification: ICreateNotification,
): Promise<ICreateNotification[]> {
  if (notification.user_id && notification.user_id > 0) {
    return [notification];
  }
  const users = await getAllUsersQuery(organizationId);
  const admins = users.filter((u) => u.role_id === ADMIN_ROLE_ID);
  // Fall back to all org users if the org has no admin (shouldn't happen, but
  // never silently drop the alert).
  const recipients = admins.length > 0 ? admins : users;
  return recipients
    .filter((u) => typeof u.id === "number" && u.id > 0)
    .map((u) => ({ ...notification, user_id: u.id as number }));
}

/**
 * Channel selection for a proactive notification.
 *
 * - `inApp`  — store + push the in-app notification (default ON).
 * - `email`  — also send an email; the config is forwarded to the in-app
 *              service which owns the email delivery (rate-limited).
 * - `slack`  — send to Slack via the user's configured integrations.
 * - `teams`  — POST to a Microsoft Teams incoming webhook.
 */
export interface IProactiveChannels {
  inApp?: boolean;
  email?: IEmailNotificationConfig;
  slack?: { userId: number; routingType: string };
  teams?: { webhookUrl?: string | null };
}

/**
 * Unified proactive notification payload.
 */
export interface IProactiveNotifyPayload {
  title: string;
  body: string;
  /** Full in-app notification record (used when the in-app/email channel fires). */
  notification: ICreateNotification;
  channels?: IProactiveChannels;
  meta?: Record<string, unknown>;
}

/**
 * Dispatch a notification to the requested channels (in-app, email,
 * Slack, Teams). Each channel sender is wrapped in its own try/catch so
 * that a failure in one channel never blocks the others, and the whole
 * call never rejects.
 *
 * In-app delivery defaults ON (`channels.inApp !== false`). Email rides
 * on the in-app sender, so requesting email implies the in-app sender is
 * invoked with `sendEmailNotification = true`.
 */
export const notifyProactive = async (
  organizationId: number,
  payload: IProactiveNotifyPayload,
): Promise<void> => {
  const channels = payload.channels ?? {};
  const wantsInApp = channels.inApp !== false;
  const wantsEmail = !!channels.email;

  // In-app + email (email is delivered by the in-app service). Resolve the
  // broadcast marker (user_id 0) to real org-admin recipients and deliver one
  // notification per recipient; a failure for one recipient never blocks the
  // rest or the other channels.
  if (wantsInApp || wantsEmail) {
    try {
      const recipients = await resolveInAppRecipients(organizationId, payload.notification);
      if (recipients.length === 0) {
        logger.warn(
          `proactiveNotify: no in-app recipients resolved for org ${organizationId}; skipping in-app/email`,
        );
      }
      for (const recipient of recipients) {
        try {
          await sendInAppNotification(organizationId, recipient, wantsEmail, channels.email);
        } catch (error) {
          logger.error(
            `proactiveNotify: in-app/email delivery failed for user ${recipient.user_id}:`,
            error,
          );
        }
      }
    } catch (error) {
      logger.error("proactiveNotify: in-app/email channel failed:", error);
    }
  }

  // Slack.
  if (channels.slack) {
    try {
      await sendSlackNotification(channels.slack, {
        title: payload.title,
        message: payload.body,
      });
    } catch (error) {
      logger.error("proactiveNotify: slack channel failed:", error);
    }
  }

  // Microsoft Teams.
  if (channels.teams) {
    try {
      await sendTeamsNotification(channels.teams.webhookUrl, {
        title: payload.title,
        text: payload.body,
      });
    } catch (error) {
      logger.error("proactiveNotify: teams channel failed:", error);
    }
  }
};
