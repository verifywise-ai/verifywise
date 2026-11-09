import { round6 } from "./round";
import type { GroupResult } from "./types";

export interface ImpactRatioArgs {
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
}

/** Why a table has no impact ratios. */
export type NoComparisonReason =
  "all_excluded" | "single_group" | "zero_rate" | "only_excluded_nonzero";

/** The reason as a clause, for the summary and the stance. */
export const NO_COMPARISON_TEXT: Record<NoComparisonReason, string> = {
  all_excluded: "every group is below the small-sample exclusion",
  single_group: "only one group is left in the calculation, so there is nothing to compare it with",
  zero_rate: "no group with a value has a non-zero rate",
  only_excluded_nonzero: "only groups below the small-sample exclusion have a non-zero rate",
};

/** The reference a table's ratios are taken against. */
export interface ReferenceRate {
  /** Unrounded highest rate among the rows left in the calculation; 0 with no comparison. */
  highestRate: number;
  /** Row holding that rate; empty with no comparison. */
  highestGroup: string;
  /** Set when the table has no ratios. Such a table is never a clean result. */
  noComparison: NoComparisonReason | null;
}

function reasonForNoComparison(
  rows: GroupResult[],
  inCalculation: GroupResult[],
): NoComparisonReason {
  if (inCalculation.length === 1) return "single_group";
  if (rows.length > 0 && inCalculation.length === 0) return "all_excluded";
  return rows.some((r) => r.excluded && r.selectedCount > 0)
    ? "only_excluded_nonzero"
    : "zero_rate";
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
 *  - a ratio needs two groups to compare, so a table with fewer than two rows
 *    in the calculation, or none with a non-zero rate, has no ratios and says
 *    why in `noComparison`. The Python gives a lone group a ratio of about 1.
 */
export function applyImpactRatios(rows: GroupResult[], args: ImpactRatioArgs): ReferenceRate {
  const { totalApplicants, threshold, smallSampleExclusion } = args;

  for (const row of rows) {
    row.excluded =
      Boolean(smallSampleExclusion) &&
      totalApplicants > 0 &&
      row.applicantCount / totalApplicants < smallSampleExclusion!;
  }

  const inCalculation = rows.filter((row) => !row.excluded);

  // Rows arrive sorted by name, so a tie goes to the first name in that order.
  let highestRate = 0;
  let highestGroup = "";
  for (const row of inCalculation) {
    const rate = row.applicantCount > 0 ? row.selectedCount / row.applicantCount : 0;
    if (rate > highestRate) {
      highestRate = rate;
      highestGroup = row.categoryName;
    }
  }

  if (inCalculation.length < 2 || highestRate <= 0) {
    for (const row of rows) row.impactRatio = null;
    return {
      highestRate: 0,
      highestGroup: "",
      noComparison: reasonForNoComparison(rows, inCalculation),
    };
  }

  for (const row of rows) {
    if (row.excluded) {
      row.impactRatio = null;
      continue;
    }
    const ratio = row.selectionRate / highestRate;
    row.impactRatio = round6(ratio);
    if (threshold !== null && ratio < threshold) row.flagged = true;
  }

  return { highestRate, highestGroup, noComparison: null };
}
