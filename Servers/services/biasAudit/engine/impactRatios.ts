import { round6 } from "./round";
import type { GroupResult } from "./types";

export interface ImpactRatioArgs {
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
}

/** The reference a table's ratios are taken against. */
export interface ReferenceRate {
  /** Unrounded highest rate among the rows left in the calculation. */
  highestRate: number;
  /** Row holding that rate; empty when no row in the calculation has a non-zero rate. */
  highestGroup: string;
}

/**
 * Fills in `excluded`, `impactRatio` and `flagged` on rows in place, and
 * returns the reference rate those ratios were taken against.
 *
 * Shared by the category and intersectional tables so the two cannot drift.
 * Ported from the identical loop in EvalServer's engine, with one change:
 * the reference comes from the rows left in the calculation. A row below the
 * small-sample proportion can no longer set the denominator for the rest.
 * That is our reading of § 5-301(d), which lets an auditor exclude a category
 * "from the required calculations for impact ratio"; the rule does not state
 * it outright.
 *
 * Details that matter:
 *
 *  - a row below the small-sample proportion is excluded: it keeps its count
 *    and rate, as (d) requires, and gets a null impact ratio;
 *  - the ratio is the ROUNDED row rate over the UNROUNDED highest rate, then
 *    rounded again;
 *  - `flagged` compares the unrounded ratio with the threshold;
 *  - when no row in the calculation has a non-zero rate, including when every
 *    row is excluded, every ratio is null and `highestGroup` is empty.
 */
export function applyImpactRatios(rows: GroupResult[], args: ImpactRatioArgs): ReferenceRate {
  const { totalApplicants, threshold, smallSampleExclusion } = args;

  for (const row of rows) {
    row.excluded =
      Boolean(smallSampleExclusion) &&
      totalApplicants > 0 &&
      row.applicantCount / totalApplicants < smallSampleExclusion!;
  }

  // Rows arrive sorted by name, so a tie goes to the first name in that order.
  let highestRate = 0;
  let highestGroup = "";
  for (const row of rows) {
    if (row.excluded) continue;
    const rate = row.applicantCount > 0 ? row.selectedCount / row.applicantCount : 0;
    if (rate > highestRate) {
      highestRate = rate;
      highestGroup = row.categoryName;
    }
  }

  for (const row of rows) {
    if (row.excluded || highestRate <= 0) {
      row.impactRatio = null;
      continue;
    }
    const ratio = row.selectionRate / highestRate;
    row.impactRatio = round6(ratio);
    if (threshold !== null && ratio < threshold) row.flagged = true;
  }

  return { highestRate, highestGroup };
}
