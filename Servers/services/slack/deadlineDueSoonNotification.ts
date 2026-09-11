import { sendSlackNotification } from "./slackNotificationService";
import { SlackNotificationRoutingType } from "../../domain.layer/enums/slack.enum";

export interface DeadlineSlackNotice {
  entityKind: "Risk" | "Model risk";
  entityName: string;
  distanceText: string; // "in 7 days" / "tomorrow" / "3 days overdue"
  deadlineText: string; // formatted date
}

/**
 * One-recipient Slack send for the deadline sweep's 1-day leg. The per-row
 * and per-recipient loops (with their try/catch) live in the sweep — this
 * helper sends exactly one message, unlike policyDueSoonNotification, whose
 * `return` inside the per-policy loop exits after the first policy.
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
  userId: number,
  notice: DeadlineSlackNotice,
): Promise<void> => {
  await sendSlackNotification(
    {
      userId,
      routingType: SlackNotificationRoutingType.EVIDENCE_AND_TASK_ALERTS,
    },
    {
      title: `${notice.entityKind} deadline approaching`,
      message: `"${notice.entityName}" is due ${notice.distanceText} (${notice.deadlineText}).`,
    },
  );
};
