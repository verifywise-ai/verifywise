import { sendInAppNotification } from "./inAppNotification.service";
import { sendSlackNotification } from "./slack/slackNotificationService";
import { sendTeamsNotification } from "./teams/teamsNotification.service";
import {
  ICreateNotification,
  IEmailNotificationConfig,
} from "../domain.layer/interfaces/i.notification";
import logger from "../utils/logger/fileLogger";

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

  // In-app + email (email is delivered by the in-app service).
  if (wantsInApp || wantsEmail) {
    try {
      await sendInAppNotification(
        organizationId,
        payload.notification,
        wantsEmail,
        channels.email,
      );
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
