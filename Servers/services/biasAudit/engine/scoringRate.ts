import type { AuditRecord } from "./types";

/**
 * A record's score as a finite number, or null when it has none.
 *
 * The one definition of a usable score across the module: the median, the
 * scoring rate, the overall rate, score distributions and the gates all read
 * scores through this. Blank (including whitespace-only) and non-numeric
 * values are null; `Number("  ")` would otherwise read a blank cell as 0.
 */
export function scoreValue(record: AuditRecord, scoreColumn: string): number | null {
  const v = record[scoreColumn];
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function scores(records: AuditRecord[], scoreColumn: string): number[] {
  const out: number[] = [];
  for (const r of records) {
    const n = scoreValue(r, scoreColumn);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Median of the full sample, matching Python's `statistics.median`. */
export function overallMedian(records: AuditRecord[], scoreColumn: string): number | null {
  const values = scores(records, scoreColumn).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * § 5-301(c) defines the scoring rate as the share of a group scoring above
 * the sample median. Strictly above, matching EvalServer.
 */
export function aboveMedian(median: number, scoreColumn: string) {
  return (record: AuditRecord): boolean => {
    const n = scoreValue(record, scoreColumn);
    return n !== null && n > median;
  };
}

export interface DegenerateMedian {
  median: number;
  atMedian: number;
  above: number;
  total: number;
  aboveFraction: number;
  distinctValues: number;
  /** "none_above" when nothing clears the median, "too_few_above" otherwise. */
  kind: "none_above" | "too_few_above";
  /** The floor `aboveFraction` fell below, so the stance can print it. */
  floor: number;
}

/**
 * A scoring rate computed from fewer than this fraction of the sample is
 * reported as degenerate. At 5% of 100 records, five candidates decide every
 * ratio in the table.
 */
export const MIN_ABOVE_MEDIAN_FRACTION = 0.05;

/**
 * Detect a score column whose median coincides with a modal value.
 *
 * When it does, "strictly above the median" excludes the whole modal block,
 * every group's rate collapses toward zero, and every impact ratio becomes
 * null — while the engine's own summary still reads "No adverse impact flags
 * detected". A caller must not present that as a clean result.
 *
 * Returns null when the median separates the sample normally.
 *
 * TWO kinds, because the near-degenerate case is the more dangerous one.
 *
 * `none_above`: nothing clears the median. Every rate is 0.0 and every ratio
 * null, while the Python's summary still reads "No adverse impact flags
 * detected". Observed on a real engagement: a three-level stoplight output with
 * 3,739 of 5,000 candidates at the top level.
 *
 * `too_few_above`: a handful clear it. The arithmetic completes and produces
 * ratios that look like findings. Verified against the Python on 100 records
 * with 97 at level 1 and 3 at level 2:
 *
 *   Female  n=50  selected=1  rate=0.02  IR=0.5   flagged=TRUE
 *   Male    n=50  selected=2  rate=0.04  IR=1.0
 *   summary: "1 group(s) flagged with impact ratio below 0.80 threshold."
 *
 * An adverse-impact flag at 0.50, decided by one record against two. This is
 * worse than `none_above`, which at least looks broken on sight.
 *
 * The choice of an at-or-above rule instead changes every impact ratio and
 * belongs to whoever is accountable for the report, not to this function. It
 * reports the condition and the floor it applied.
 */
export function detectDegenerateMedian(
  records: AuditRecord[],
  scoreColumn: string,
  floor: number = MIN_ABOVE_MEDIAN_FRACTION,
): DegenerateMedian | null {
  const values = scores(records, scoreColumn);
  if (values.length === 0) return null;

  const median = overallMedian(records, scoreColumn)!;
  const above = values.filter((v) => v > median).length;
  const aboveFraction = above / values.length;
  if (aboveFraction >= floor) return null;

  return {
    median,
    atMedian: values.filter((v) => v === median).length,
    above,
    total: values.length,
    aboveFraction,
    distinctValues: new Set(values).size,
    kind: above === 0 ? "none_above" : "too_few_above",
    floor,
  };
}
