import axios from "axios";
import logger from "../../utils/logger/fileLogger";

/**
 * Shape of an outbound Microsoft Teams notification.
 */
export interface ITeamsMessage {
  title: string;
  text: string;
}

/**
 * Build a legacy Teams "MessageCard" (actionable message card) payload.
 * Incoming Webhooks accept this JSON shape directly.
 */
const buildMessageCard = (message: ITeamsMessage) => ({
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  summary: message.title,
  title: message.title,
  text: message.text,
});

/**
 * Send an outbound notification to a Microsoft Teams channel via an
 * Incoming Webhook URL.
 *
 * The webhook URL is supplied by the caller (resolved from env / org
 * config upstream). When no webhook URL is configured this is a no-op:
 * it returns early without throwing so callers don't have to guard.
 *
 * Errors from the HTTP client are logged and swallowed so a Teams
 * delivery failure never breaks the calling flow.
 */
export const sendTeamsNotification = async (
  webhookUrl: string | undefined | null,
  message: ITeamsMessage,
): Promise<void> => {
  if (!webhookUrl) {
    return;
  }

  try {
    await axios.post(webhookUrl, buildMessageCard(message), {
      headers: { "Content-Type": "application/json" },
    });
    logger.info(`Teams notification sent: ${message.title}`);
  } catch (error) {
    logger.error("Error sending Teams notification:", error);
  }
};
