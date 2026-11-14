/**
 * Risk enum vocabularies — mirror the Postgres enum types declared in
 * migration 20260226234300-base-enums-and-roles.js. Kept as inline constants
 * so both the Excel template dropdowns and row validation can reuse the
 * exact same allowed-value sets without a DB round-trip.
 */

export const AI_LIFECYCLE_PHASES = [
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
] as const;

export const LIKELIHOOD_VALUES = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain",
] as const;

export const SEVERITY_VALUES = [
  "Negligible",
  "Minor",
  "Moderate",
  "Major",
  "Catastrophic",
] as const;

export const RISK_SEVERITY_VALUES = [
  "Negligible",
  "Minor",
  "Moderate",
  "Major",
  "Critical",
] as const;

export const RISK_LEVEL_VALUES = [
  "No risk",
  "Very low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
] as const;

export const CURRENT_RISK_LEVEL_VALUES = [
  "Very low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
] as const;

export const MITIGATION_STATUS_VALUES = [
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
] as const;

export const RISK_CATEGORY_VALUES = [
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
] as const;
