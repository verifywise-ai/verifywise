/**
 * Retention policy values — single source of truth on the backend for the
 * verifywise.enum_retention_policy Postgres type. Every consumer (Sequelize
 * @Column, controller validation, sweep query, computeExpiryDate) derives
 * from this array. Order matches the migration.
 *
 * Frontend has its own mirror at Clients/src/domain/constants/retention.ts;
 * the two must stay in sync with each other and with the enum migration.
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

/** Mutable copy for Sequelize DataType.ENUM(...) — it wants a plain string[]. */
export const RETENTION_POLICY_ENUM_VALUES: string[] = [...RETENTION_POLICIES];

/** True when `value` is one of the canonical retention policies. */
export const isRetentionPolicy = (value: unknown): value is RetentionPolicy =>
  typeof value === "string" && (RETENTION_POLICIES as readonly string[]).includes(value);

const RETENTION_DAYS: Partial<Record<RetentionPolicy, number>> = {
  "30_days": 30,
  "90_days": 90,
};

const RETENTION_MONTHS: Partial<Record<RetentionPolicy, number>> = {
  "6_months": 6,
  "1_year": 12,
  "3_years": 36,
  "5_years": 60,
  "7_years": 84,
};

/**
 * Compute the expiry date for a retention policy relative to baseDate.
 * "indefinite", null/undefined, and unrecognized values all mean "no
 * expiry" and return null — never an error, never already-expired.
 */
export const computeExpiryDate = (
  retentionPolicy: string | null | undefined,
  baseDate: Date = new Date(),
): Date | null => {
  if (!retentionPolicy || retentionPolicy === "indefinite") return null;

  const days = RETENTION_DAYS[retentionPolicy as RetentionPolicy];
  if (days !== undefined) {
    const expiry = new Date(baseDate);
    expiry.setDate(expiry.getDate() + days);
    return expiry;
  }

  const months = RETENTION_MONTHS[retentionPolicy as RetentionPolicy];
  if (months !== undefined) {
    const expiry = new Date(baseDate);
    expiry.setMonth(expiry.getMonth() + months);
    return expiry;
  }

  return null;
};

/**
 * Format a Date as YYYY-MM-DD (Postgres DATE literal). Callers writing
 * files.expiry_date want the daily-granularity form, not an ISO timestamp.
 */
export const toExpiryDateString = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Resolve the (expiry_date, retention_policy) pair to persist when a file is
 * being INSERTed. Precedence:
 *   1. Explicit expiry_date on the request → wins outright.
 *   2. Explicit retention_policy → derive expiry_date from it.
 *   3. Org default (file_org_settings.default_retention_policy) → apply
 *      both the policy and its derived expiry_date.
 *   4. Nothing configured → both NULL (file never enters the sweep).
 *
 * NOTE: this is intended for the file CREATE path. Metadata updates go
 * through updateFileMetadata, which respects explicit updates directly and
 * does NOT re-consult the org default (an update to just tags shouldn't
 * silently re-derive expiry from the current org policy).
 */
import { getFileOrgSettings } from "./fileOrgSettings.utils";

export interface ResolvedFileExpiry {
  expiry_date: string | null;
  retention_policy: RetentionPolicy | null;
}

export const resolveFileExpiryOnCreate = async (
  organizationId: number,
  explicitExpiryDate: string | Date | null | undefined,
  explicitRetentionPolicy: string | null | undefined,
  baseDate: Date = new Date(),
): Promise<ResolvedFileExpiry> => {
  if (explicitExpiryDate) {
    const parsed =
      explicitExpiryDate instanceof Date ? explicitExpiryDate : new Date(explicitExpiryDate);
    const expiry_date = isNaN(parsed.getTime()) ? null : toExpiryDateString(parsed);
    return {
      expiry_date,
      retention_policy: isRetentionPolicy(explicitRetentionPolicy) ? explicitRetentionPolicy : null,
    };
  }

  if (isRetentionPolicy(explicitRetentionPolicy)) {
    const derived = computeExpiryDate(explicitRetentionPolicy, baseDate);
    return {
      expiry_date: derived ? toExpiryDateString(derived) : null,
      retention_policy: explicitRetentionPolicy,
    };
  }

  const orgDefault = (await getFileOrgSettings(organizationId)).default_retention_policy;
  if (isRetentionPolicy(orgDefault)) {
    const derived = computeExpiryDate(orgDefault, baseDate);
    return {
      expiry_date: derived ? toExpiryDateString(derived) : null,
      retention_policy: orgDefault,
    };
  }

  return { expiry_date: null, retention_policy: null };
};
