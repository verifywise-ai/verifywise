/**
 * The MRM periodic review cadence. Kept free of the database so the report
 * renderers can state it without loading the models; mrm.utils re-exports it.
 */

import { MrmTier } from "../domain.layer/enums/mrm.enum";

/**
 * Months between periodic validations for each tier: Tier 1 every year, Tier 2
 * every 18 months, Tier 3 every 2 years. Settings → Tiering rules shows the same
 * cadence, and the backfill migration `20261121120000-mrm-backfill-next-due` uses
 * the same numbers.
 */
export const REVALIDATION_CADENCE_MONTHS: Record<MrmTier, number> = {
  [MrmTier.TIER_1]: 12,
  [MrmTier.TIER_2]: 18,
  [MrmTier.TIER_3]: 24,
};

/**
 * When the next periodic review is due, counted from `from` by the tier's
 * cadence. An untiered model has no cadence and gets no due date (null). Month
 * arithmetic clamps to the last day of a shorter month (Jan 31 + 1 month → Feb
 * 28/29), the same as Postgres `+ interval 'N months'`.
 */
export function computeNextReviewDue(
  tier: MrmTier | string | null | undefined,
  from: Date,
): Date | null {
  const months = tier ? REVALIDATION_CADENCE_MONTHS[tier as MrmTier] : undefined;
  if (!months) return null;
  const due = new Date(from.getTime());
  const day = due.getUTCDate();
  due.setUTCDate(1);
  due.setUTCMonth(due.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
  due.setUTCDate(Math.min(day, lastDay));
  return due;
}
