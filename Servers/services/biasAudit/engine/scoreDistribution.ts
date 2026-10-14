import { groupValue } from "./groupValue";
import { RECORD_KEYS } from "./recordKeys";
import { round6 } from "./round";
import { scoreValue } from "./scoringRate";
import type { AuditRecord, ScoreDistributionTable, ScoreDistributionGroup } from "./types";

/** Arithmetic mean, matching Python's `statistics.mean`. */
function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Median of a sorted-on-demand sample, matching `statistics.median`. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * POPULATION standard deviation, matching Python's `statistics.pstdev`.
 *
 * Not `stdev`, the sample version: pstdev divides by n, stdev by n-1. The
 * Python engine calls pstdev, so the sample version would diverge on every
 * group.
 */
function pstdev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/**
 * Two-sample Kolmogorov-Smirnov statistic and asymptotic p-value.
 *
 * An O(n + m) merge traversal of the two empirical CDFs. Returns nulls when
 * either sample is empty.
 *
 * Diverges from EvalServer's `_ks_two_sample` on ties, deliberately. The
 * Python steps one value at a time and measures the gap part-way through a
 * run of equal values, where neither CDF is defined; on a discrete score
 * column that reports identical samples as maximally different
 * ([1,1] against [1,1,1,1] gives D = 1). Here both pointers move past every
 * copy of the current value before the gap is measured, which is the
 * standard statistic (scipy's `ks_2samp`).
 */
export function ksTwoSample(
  aSorted: number[],
  bSorted: number[],
): { d: number | null; p: number | null } {
  const n = aSorted.length;
  const m = bSorted.length;
  if (n === 0 || m === 0) return { d: null, p: null };

  let i = 0;
  let j = 0;
  let d = 0;
  while (i < n && j < m) {
    const x = Math.min(aSorted[i], bSorted[j]);
    while (i < n && aSorted[i] <= x) i += 1;
    while (j < m && bSorted[j] <= x) j += 1;
    const diff = Math.abs(i / n - j / m);
    if (diff > d) d = diff;
  }

  const en = Math.sqrt((n * m) / (n + m));
  const lam = (en + 0.12 + 0.11 / en) * d;
  return { d, p: ksP(lam) };
}

/** Kolmogorov distribution survival function (Numerical Recipes form). */
function ksP(lam: number): number {
  if (lam < 0.001) return 1;
  const eps1 = 0.001;
  const eps2 = 1e-8;
  const a2 = -2 * lam * lam;
  let total = 0;
  let termPrev = 0;
  for (let j = 1; j <= 100; j += 1) {
    const term = 2 * (-1) ** (j - 1) * Math.exp(a2 * j * j);
    total += term;
    if (Math.abs(term) <= eps1 * termPrev || Math.abs(term) <= eps2 * total) {
      return Math.max(0, Math.min(1, total));
    }
    termPrev = Math.abs(term);
  }
  return 1;
}

export interface ScoreDistributionArgs {
  records: AuditRecord[];
  categoryKey: string;
  categoryLabel: string;
  bins?: number;
}

/**
 * Per-group score histograms with a K-S test against the overall distribution.
 *
 * Ported from EvalServer's `_compute_score_distribution_table`. Like the rest
 * of the engine it reads the literal `score` key rather than a configured
 * column name.
 */
export function computeScoreDistributionTable(args: ScoreDistributionArgs): ScoreDistributionTable {
  const { records, categoryKey, categoryLabel, bins = 20 } = args;
  const title = `Score distributions by ${categoryLabel.toLowerCase()}`;

  const overallScores: number[] = [];
  for (const r of records) {
    const v = scoreValue(r, RECORD_KEYS.score);
    if (v !== null) overallScores.push(v);
  }

  if (overallScores.length === 0) {
    return {
      title,
      categoryKey,
      groups: [],
      overallMean: null,
      overallMedian: null,
    };
  }

  // A loop, not Math.min(...xs): spreading hundreds of thousands of
  // arguments overflows the call stack.
  let lo = overallScores[0];
  let hi = overallScores[0];
  for (const v of overallScores) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi === lo) hi = lo + 1; // avoid zero-width bins
  const binWidth = (hi - lo) / bins;

  const grouped = new Map<string, number[]>();
  for (const r of records) {
    const v = scoreValue(r, RECORD_KEYS.score);
    if (v === null) continue;
    const name = groupValue(r, categoryKey);
    if (name === null) continue;
    const list = grouped.get(name) ?? [];
    list.push(v);
    grouped.set(name, list);
  }

  const sortedOverall = [...overallScores].sort((a, b) => a - b);
  const groups: ScoreDistributionGroup[] = [];

  for (const groupName of [...grouped.keys()].sort()) {
    const scores = grouped.get(groupName)!;
    if (scores.length === 0) continue;

    const counts = new Array(bins).fill(0);
    for (const s of scores) {
      let idx = Math.trunc((s - lo) / binWidth);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      counts[idx] += 1;
    }

    const { d, p } = ksTwoSample(
      [...scores].sort((a, b) => a - b),
      sortedOverall,
    );

    groups.push({
      categoryType: categoryKey,
      categoryName: groupName,
      count: scores.length,
      mean: round6(mean(scores)),
      median: round6(median(scores)),
      std: round6(pstdev(scores)),
      bins: Array.from({ length: bins }, (_, i) => ({
        lower: round6(lo + i * binWidth),
        upper: round6(lo + (i + 1) * binWidth),
        count: counts[i],
      })),
      ksStatistic: d === null ? null : round6(d),
      ksPvalue: p === null ? null : round6(p),
    });
  }

  return {
    title,
    categoryKey,
    groups,
    overallMean: round6(mean(overallScores)),
    overallMedian: round6(median(overallScores)),
  };
}
