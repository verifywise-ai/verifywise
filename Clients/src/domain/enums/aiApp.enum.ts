export enum AiAppStatus {
  DRAFT = "draft",
  UNDER_REVIEW = "under_review",
  APPROVED = "approved",
  RESTRICTED = "restricted",
  BANNED = "banned",
}

export enum AiAppDiscoveredSource {
  MANUAL = "manual",
  SHADOW_AI = "shadow_ai",
  EMPLOYEE_REPORT = "employee_report",
  PROCUREMENT = "procurement",
  SSO = "sso",
  PROXY = "proxy",
  FIREWALL = "firewall",
}

export enum AiAppPolicyStatus {
  APPLICABLE = "applicable",
  NOT_APPLICABLE = "not_applicable",
  REQUIRED = "required",
}
