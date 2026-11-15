import logger from "../../utils/logger/fileLogger";
import { decryptText } from "../../tools/createSecureValue";
import { WebClient } from "@slack/web-api";
import { ISlackWebhook } from "../../domain.layer/interfaces/i.slackWebhook";
import {
  deactivateSlackWebhookQuery,
  getDeliverableSlackWebhooksQuery,
} from "../../utils/slackWebhook.utils";
import { isExtensionEnabledForOrganization } from "../../middleware/requireExtensionEnabled.middleware";
import { SlackNotificationRoutingType } from "../../domain.layer/enums/slack.enum";

const SLACK_EXTENSION_KEY = "slack";
const ROUTING_TYPES = new Set<string>(Object.values(SlackNotificationRoutingType));

export const inviteBotToChannel = async (
  accessToken: string,
  channelId: string,
  botUserId: string,
) => {
  // Use the USER token (not bot token) to invite the bot
  const userClient = new WebClient(accessToken);

  try {
    // First, verify the channel exists and is accessible
    const channelInfo = await userClient.conversations.info({
      channel: channelId,
    });

    if (channelInfo.channel?.is_private) {
      // Invite the bot to the channel
      await userClient.conversations.invite({
        channel: channelId,
        users: botUserId!,
      });

      logger.info(`Bot successfully invited to channel ${channelId}:`, {
        channel: channelId,
      });
    }

    return { success: true };
  } catch (error: any) {
    logger.info(`Error inviting bot to ${channelId}:`, {
      messageId: error.message,
      channel: channelId,
    });

    throw error;
  }
};

const getClient = (accessToken: string, iv: string) => {
  const { data, success, error } = decryptText({ iv: iv, value: accessToken });
  if (!success) {
    throw new Error(`Failed to decrypt Slack access token: ${error}`);
  }
  return new WebClient(data);
};

export interface SlackSendResult {
  /** At least one webhook integration exists for this routing. */
  attempted: boolean;
  /** At least one message posted successfully. */
  delivered: boolean;
}

export interface SlackNotificationParams {
  /** The organization the event happened in. Connections of other organizations never match. */
  organizationId: number;
  /**
   * The user who triggered the event. Connections still scoped to their owner
   * (delivery_scope 'user') send only for their owner's events; without a user
   * only organization-wide connections match.
   */
  userId?: number | null;
  /**
   * Only the user's own (delivery_scope 'user') connections. For senders that
   * notify several people about one event: they post once without a user for
   * the organization-wide connections, then per recipient with this set, so a
   * shared channel gets one post per event instead of one per recipient.
   */
  ownConnectionsOnly?: boolean;
  routingType: string;
}

const NOT_SENT: SlackSendResult = { attempted: false, delivered: false };

/**
 * Post one event to every Slack connection that should receive it: active,
 * in the event's organization, routed for its type, organization-wide or
 * owned by the triggering user — and only while Slack is enabled for that
 * organization.
 */
export const sendSlackNotification = async (
  params: SlackNotificationParams,
  message: any,
): Promise<SlackSendResult> => {
  try {
    const { organizationId, routingType } = params;
    // Typed as required, but a job queued before organization scoping (or a
    // caller passing an unchecked value) can still arrive without one. Drop
    // it: an event with no organization must never reach a channel.
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      logger.warn(`Slack notification dropped: no organization (routing type "${routingType}")`);
      return NOT_SENT;
    }
    // Only the types a connection can be routed for. Anything else never
    // matched a connection the UI can create, so it stays undelivered.
    if (!ROUTING_TYPES.has(routingType)) {
      logger.debug(`Slack notification skipped: unknown routing type "${routingType}"`);
      return NOT_SENT;
    }
    if (!(await isExtensionEnabledForOrganization(SLACK_EXTENSION_KEY, organizationId))) {
      return NOT_SENT;
    }
    const userId =
      Number.isInteger(params.userId) && (params.userId as number) > 0 ? params.userId : null;
    // Own connections only, but no user to own them: nothing can match.
    if (params.ownConnectionsOnly && userId === null) return NOT_SENT;
    const slackIntegrations: ISlackWebhook[] = await getDeliverableSlackWebhooksQuery({
      organizationId,
      userId,
      routingType,
      ownConnectionsOnly: params.ownConnectionsOnly === true,
    });
    // No webhook is the normal dev path, not an error — and not a delivery.
    if (slackIntegrations.length === 0) return NOT_SENT;
    const results = await Promise.allSettled(
      slackIntegrations.map((integration) => sendImmediateMessage(integration, message)),
    );
    const delivered = results.some((result) => result.status === "fulfilled");
    return { attempted: true, delivered };
  } catch (error: any) {
    logger.error("Error sending Slack Notification:", error);
    return { attempted: true, delivered: false };
  }
};

export const sendImmediateMessage = async (integration: ISlackWebhook, message: any) => {
  try {
    const client = getClient(integration.access_token, integration.access_token_iv as string);

    const channel = integration.channel_id;
    const msg = formatSlackMessage(message);

    const result = await client.chat.postMessage({
      channel,
      ...msg,
    });

    logger.info(`Message sent to ${channel}:`, {
      messageId: result.ts,
      channel: result.channel,
    });

    return {
      success: true,
      messageId: result.ts,
      channel: result.channel,
    };
  } catch (error: any) {
    logger.error("Error sending Slack message:", error);
    const NOT_ACTIVE_ERRORS = ["channel_not_found", "is_archived"];
    if (NOT_ACTIVE_ERRORS.includes(error?.data?.error)) {
      if (integration.id && integration.organization_id) {
        await deactivateSlackWebhookQuery(integration.id, integration.organization_id);
      } else {
        logger.warn(`Slack connection ${integration.id} has no organization; not deactivated`);
      }
    }
    throw error;
  }
};

export const formatSlackMessage = (data: any) => {
  return {
    text: `A message from VerifyWise`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${data.title}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${data.message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📅 ${new Date().toLocaleString("en-US", { timeZone: "UTC" })} UTC`,
          },
        ],
      },
    ],
  };
};
