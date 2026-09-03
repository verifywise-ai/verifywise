import { getEvidenceHubOrgSettings } from "./evidenceHubSettings.utils";

/**
 * Evidence Hub retention periods — mirrors the RETENTION_OPTIONS enum in
 * Clients/src/presentation/components/Modals/EvidenceHub/index.tsx.
 */
export const EVIDENCE_RETENTION_PERIODS = [
  "30_days",
  "90_days",
  "6_months",
  "1_year",
  "3_years",
  "5_years",
  "7_years",
  "indefinite",
] as const;

export type EvidenceRetentionPeriod = (typeof EVIDENCE_RETENTION_PERIODS)[number];

const RETENTION_DAYS: Partial<Record<EvidenceRetentionPeriod, number>> = {
  "30_days": 30,
  "90_days": 90,
};

const RETENTION_MONTHS: Partial<Record<EvidenceRetentionPeriod, number>> = {
  "6_months": 6,
  "1_year": 12,
  "3_years": 36,
  "5_years": 60,
  "7_years": 84,
};

/**
 * Compute the expiry date for a retention period relative to baseDate.
 * "indefinite", null/undefined, and unrecognized values all mean "no
 * expiry" and return null — never an error, never already-expired.
 */
export const computeExpiryDate = (
  retentionPeriod: string | null | undefined,
  baseDate: Date = new Date(),
): Date | null => {
  if (!retentionPeriod || retentionPeriod === "indefinite") return null;

  const days = RETENTION_DAYS[retentionPeriod as EvidenceRetentionPeriod];
  if (days !== undefined) {
    const expiry = new Date(baseDate);
    expiry.setDate(expiry.getDate() + days);
    return expiry;
  }

  const months = RETENTION_MONTHS[retentionPeriod as EvidenceRetentionPeriod];
  if (months !== undefined) {
    const expiry = new Date(baseDate);
    expiry.setMonth(expiry.getMonth() + months);
    return expiry;
  }

  return null;
};

/**
 * Resolve the expiry date for an evidence record. Precedence:
 *   explicit expiry_date > per-evidence retention_policy > org default > null
 * A null result means "no expiry" and is valid everywhere downstream.
 */
export const resolveEvidenceExpiryDate = async (
  organizationId: number,
  explicitExpiryDate: Date | string | null | undefined,
  retentionPolicy: string | null | undefined,
  baseDate: Date = new Date(),
): Promise<Date | null> => {
  if (explicitExpiryDate) {
    const parsed = new Date(explicitExpiryDate);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const period =
    retentionPolicy ??
    (await getEvidenceHubOrgSettings(organizationId)).default_retention_period;
  return computeExpiryDate(period, baseDate);
};
