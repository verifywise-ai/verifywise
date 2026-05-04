import logger from "../../utils/logger/fileLogger";
import { decryptText } from "../../tools/createSecureValue";
import { WebClient } from "@slack/web-api";
import { ISlackWebhook } from "../../domain.layer/interfaces/i.slackWebhook";
import { getSlackWebhookByIdAndRoutingType } from "../../utils/slackWebhook.utils";
import { disableSlackActivity } from "../../controllers/slackWebhook.ctrl";

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

export const sendSlackNotification = async (
  params: { userId: number; routingType: string },
  message: any,
) => {
  try {
    const { userId, routingType } = params;
    const slackIntegrations: ISlackWebhook[] = await getSlackWebhookByIdAndRoutingType(
      userId,
      routingType,
    );
    await Promise.all(
      slackIntegrations.map((integration) => sendImmediateMessage(integration, message)),
    );
  } catch (error: any) {
    logger.error("Error sending Slack Notification:", error);
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
    if (NOT_ACTIVE_ERRORS.includes(error.data.error)) {
      await disableSlackActivity(integration.id!);
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
