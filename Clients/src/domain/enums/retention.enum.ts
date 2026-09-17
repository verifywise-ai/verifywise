/**
 * Retention policy values — single source of truth on the frontend for
 * files.retention_policy. Every consumer (type, form dropdown, display
 * label, preview panel) derives from this array.
 *
 * Backend mirror lives at Servers/utils/retention.utils.ts. The two must
 * stay in sync with each other and with the verifywise.enum_retention_policy
 * migration.
 */
export const RETENTION_POLICIES = [
  "30_days",
  "90_days",
  "6_months",
  "1_year",
  "3_years",
  "5_years",
  "7_years",
  "indefinite",
] as const;

export type RetentionPolicy = (typeof RETENTION_POLICIES)[number];

/** Human labels for each policy — used in dropdown items and preview cells. */
export const RETENTION_POLICY_LABELS: Record<RetentionPolicy, string> = {
  "30_days": "30 days",
  "90_days": "90 days",
  "6_months": "6 months",
  "1_year": "1 year",
  "3_years": "3 years",
  "5_years": "5 years",
  "7_years": "7 years",
  "indefinite": "Indefinite",
};

/** Dropdown-shaped items for VerifyWise Select components. */
export const RETENTION_POLICY_OPTIONS: Array<{ _id: RetentionPolicy | ""; name: string }> = [
  { _id: "", name: "None" },
  ...RETENTION_POLICIES.map((p) => ({ _id: p, name: RETENTION_POLICY_LABELS[p] })),
];
