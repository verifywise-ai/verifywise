export enum SlackNotificationRoutingType {
  MEMBERSHIP_AND_ROLES = "Membership and roles",
  PROJECTS_AND_ORGANIZATIONS = "Projects and organizations",
  POLICY_REMINDERS_AND_STATUS = "Policy reminders and status",
  EVIDENCE_AND_TASK_ALERTS = "Evidence and task alerts",
  CONTROL_OR_POLICY_CHANGES = "Control or policy changes",
}

const SLACK_ROUTING_TYPES: ReadonlySet<string> = new Set(
  Object.values(SlackNotificationRoutingType),
);

/** True for a known routing type: the allow-list every routing write checks. */
export function isSlackRoutingType(value: unknown): value is SlackNotificationRoutingType {
  return typeof value === "string" && SLACK_ROUTING_TYPES.has(value);
}

/**
 * Who a Slack connection delivers for. "organization": every routed event in
 * the connection's organization. "user": only events its owner triggered —
 * connections that existed before organization ownership keep this until an
 * Admin saves their routing again.
 */
export enum SlackDeliveryScope {
  USER = "user",
  ORGANIZATION = "organization",
}
