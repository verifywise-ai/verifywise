export enum SlackNotificationRoutingType {
  MEMBERSHIP_AND_ROLES = "Membership and roles",
  PROJECTS_AND_ORGANIZATIONS = "Projects and organizations",
  POLICY_REMINDERS_AND_STATUS = "Policy reminders and status",
  EVIDENCE_AND_TASK_ALERTS = "Evidence and task alerts",
  CONTROL_OR_POLICY_CHANGES = "Control or policy changes",
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
