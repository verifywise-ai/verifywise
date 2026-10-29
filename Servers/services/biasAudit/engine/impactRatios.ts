import { round6 } from "./round";
import type { GroupResult } from "./types";

export interface ImpactRatioArgs {
  /** Unrounded highest selection rate across all rows. */
  highestRate: number;
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
}

/**
 * Fills in `excluded`, `impactRatio` and `flagged` on rows in place.
 *
 * Shared by the category and intersectional tables so the two cannot drift.
 * Ported from the identical loop in EvalServer's engine. Details that matter:
 *
 *  - a row below the small-sample proportion is excluded: it keeps its rate
 *    and gets a null impact ratio;
 *  - the ratio is the ROUNDED row rate over the UNROUNDED highest rate, then
 *    rounded again;
 *  - `flagged` compares the unrounded ratio with the threshold;
 *  - when the highest rate is 0, every ratio is null.
 */
export function applyImpactRatios(rows: GroupResult[], args: ImpactRatioArgs): void {
  const { highestRate, totalApplicants, threshold, smallSampleExclusion } = args;

  for (const row of rows) {
    if (smallSampleExclusion && totalApplicants > 0) {
      const proportion = row.applicantCount / totalApplicants;
      if (proportion < smallSampleExclusion) {
        row.excluded = true;
        row.impactRatio = null;
        continue;
      }
    }
    if (highestRate > 0) {
      const ratio = row.selectionRate / highestRate;
      row.impactRatio = round6(ratio);
      if (threshold !== null && ratio < threshold) row.flagged = true;
    } else {
      row.impactRatio = null;
    }
  }
}
