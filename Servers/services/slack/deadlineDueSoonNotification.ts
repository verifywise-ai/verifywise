import { sendSlackNotification, SlackSendResult } from "./slackNotificationService";
import { SlackNotificationRoutingType } from "../../domain.layer/enums/slack.enum";

export interface DeadlineSlackNotice {
  entityKind: "Risk" | "Model risk";
  entityName: string;
  distanceText: string; // "in 7 days" / "tomorrow" / "3 days overdue"
  deadlineText: string; // formatted date
}

/**
 * One Slack send for the deadline sweep's 1-day leg. The per-row and
 * per-recipient loops (with their try/catch) live in the sweep — this helper
 * sends exactly one message, unlike policyDueSoonNotification, whose `return`
 * inside the per-policy loop exits after the first policy.
 *
 * `userId` null: the organization-wide connections, once per row. A user:
 * only that user's own connections, once per recipient — so a shared channel
 * gets one post per deadline, not one per owner and admin.
 *
 * Deliberate reuse of EVIDENCE_AND_TASK_ALERTS: routing_type is a Postgres
 * ARRAY(ENUM) column and a dedicated risk value would cost a second migration
 * for a label.
 *
 * With 0 rows in slack_webhooks (the normal dev path), sendSlackNotification
 * resolves having sent nothing — that must not fail the sweep or log at error
 * level, and it does not.
 */
export const sendDeadlineDueSoonSlackNotification = async (
  organizationId: number,
  userId: number | null,
  notice: DeadlineSlackNotice,
): Promise<SlackSendResult> => {
  return sendSlackNotification(
    {
      organizationId,
      userId,
      ownConnectionsOnly: userId !== null,
      routingType: SlackNotificationRoutingType.EVIDENCE_AND_TASK_ALERTS,
    },
    {
      title: `${notice.entityKind} deadline approaching`,
      message: `"${notice.entityName}" is due ${notice.distanceText} (${notice.deadlineText}).`,
    },
  );
};
