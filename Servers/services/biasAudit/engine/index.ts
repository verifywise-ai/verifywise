import { computeCategoryTable } from "./categoryTable";
import { computeFairnessMetricsTable } from "./fairnessMetrics";
import { computeIntersectionalTable } from "./intersectional";
import { RECORD_KEYS } from "./recordKeys";
import { formatPercent, round6 } from "./round";
import { computeScoreDistributionTable } from "./scoreDistribution";
import { aboveMedian, detectDegenerateMedian, overallMedian, scoreValue } from "./scoringRate";
import type {
  AuditRecord,
  BiasAuditConfig,
  BiasAuditResult,
  CategoryTable,
  FairnessMetricsTable,
  ScoreDistributionTable,
} from "./types";

export { computeCategoryTable } from "./categoryTable";
export { computeFairnessMetricsTable } from "./fairnessMetrics";
export { computeIntersectionalTable } from "./intersectional";
export { groupValue, isBlankValue } from "./groupValue";
export { RECORD_KEYS } from "./recordKeys";
export { formatPercent, round6 } from "./round";
export { computeScoreDistributionTable, ksTwoSample } from "./scoreDistribution";
export {
  aboveMedian,
  detectDegenerateMedian,
  overallMedian,
  MIN_ABOVE_MEDIAN_FRACTION,
  scoreValue,
} from "./scoringRate";
export type { DegenerateMedian } from "./scoringRate";
export type * from "./types";

/** Python's `f"{n:,}"`. */
function withThousands(n: number): string {
  return n.toLocaleString("en-US");
}

/** Python's `f"{x:.2f}"`. */
function twoDecimals(x: number): string {
  return x.toFixed(2);
}

/**
 * Run the full bias audit computation.
 *
 * Ported from EvalServer's `compute_bias_audit`. Dispatches on
 * `config.metric`:
 *
 *  - `selection_rate` (§ 5-301(b)) reads the literal `selected` key;
 *  - `scoring_rate` (§ 5-301(c)) reads `score` and rates strictly above the
 *    sample median;
 *  - `fairness_metrics` reads `prediction` and `ground_truth`.
 *
 * Like the Python, it reads those literal keys rather than the configured
 * column names, so a caller maps its columns before calling.
 *
 * Deliberate divergences from the Python, all in the summary text; the
 * arithmetic is identical. Where the Python reports "No adverse impact flags
 * detected" for a computation that produced no ratios, this says why instead:
 *
 *  - a degenerate median: none, or too few, of the records score above it
 *    (the condition is also returned in `diagnostics`);
 *  - a table with no reference group, because no group with a value has a
 *    non-zero rate;
 *  - no protected category configured at all.
 *
 * Group names also differ in one respect: a whitespace-only value is blank
 * (see groupValue.ts), where the Python treats it as a group.
 */
export function computeBiasAudit(
  records: AuditRecord[],
  config: BiasAuditConfig,
  unknownCount = 0,
): BiasAuditResult {
  const totalApplicants = records.length;
  const metric = config.metric || "selection_rate";

  const tables: CategoryTable[] = [];
  const scoreDistributionTables: ScoreDistributionTable[] = [];
  const fairnessMetricsTables: FairnessMetricsTable[] = [];
  let totalFlags = 0;
  let totalExcluded = 0;
  let totalSelected = 0;
  let overallRate = 0;
  let median: number | null = null;

  const countTable = (table: CategoryTable) => {
    tables.push(table);
    totalFlags += table.rows.filter((r) => r.flagged).length;
    totalExcluded += table.rows.filter((r) => r.excluded).length;
  };

  if (metric === "selection_rate") {
    totalSelected = records.filter((r) => Boolean(r[RECORD_KEYS.selected])).length;
    overallRate = totalApplicants > 0 ? totalSelected / totalApplicants : 0;
    const rateOf = (r: AuditRecord) => Boolean(r[RECORD_KEYS.selected]);

    for (const [categoryKey, categoryConfig] of Object.entries(config.categories)) {
      countTable(
        computeCategoryTable({
          records,
          categoryKey,
          categoryLabel: categoryConfig.label,
          totalApplicants,
          threshold: config.threshold,
          smallSampleExclusion: config.smallSampleExclusion,
          rateOf,
        }),
      );
    }

    if (config.intersectional.required && config.intersectional.cross.length >= 2) {
      countTable(
        computeIntersectionalTable({
          records,
          crossKeys: config.intersectional.cross,
          totalApplicants,
          threshold: config.threshold,
          smallSampleExclusion: config.smallSampleExclusion,
          rateOf,
        }),
      );
    }
  } else if (metric === "scoring_rate") {
    median = overallMedian(records, RECORD_KEYS.score);
    if (median === null) {
      throw new Error("Scoring rate mode requires a score column with numeric values.");
    }
    // The same sample the median was taken over: blank and non-numeric
    // scores are in neither the numerator nor the denominator.
    const scored = records.filter((r) => scoreValue(r, RECORD_KEYS.score) !== null);
    totalSelected = scored.filter((r) => scoreValue(r, RECORD_KEYS.score)! > median!).length;
    overallRate = scored.length > 0 ? totalSelected / scored.length : 0;
    const rateOf = aboveMedian(median, RECORD_KEYS.score);

    for (const [categoryKey, categoryConfig] of Object.entries(config.categories)) {
      countTable(
        computeCategoryTable({
          records,
          categoryKey,
          categoryLabel: categoryConfig.label,
          totalApplicants,
          threshold: config.threshold,
          smallSampleExclusion: config.smallSampleExclusion,
          rateOf,
          titlePrefix: "Scoring rate impact ratios",
        }),
      );
    }

    if (config.intersectional.required && config.intersectional.cross.length >= 2) {
      countTable(
        computeIntersectionalTable({
          records,
          crossKeys: config.intersectional.cross,
          totalApplicants,
          threshold: config.threshold,
          smallSampleExclusion: config.smallSampleExclusion,
          rateOf,
          title: "Scoring rate impact ratios by intersectional category",
        }),
      );
    }
  } else if (metric === "fairness_metrics") {
    const hasBoth = records.some(
      (r) => RECORD_KEYS.prediction in r && RECORD_KEYS.groundTruth in r,
    );
    if (!hasBoth) {
      throw new Error("Fairness metrics mode requires both prediction and ground_truth columns.");
    }
    totalSelected = records.filter((r) => Boolean(r[RECORD_KEYS.prediction])).length;
    overallRate = totalApplicants > 0 ? totalSelected / totalApplicants : 0;

    for (const [categoryKey, categoryConfig] of Object.entries(config.categories)) {
      const table = computeFairnessMetricsTable({
        records,
        categoryKey,
        categoryLabel: categoryConfig.label,
        totalApplicants,
        smallSampleExclusion: config.smallSampleExclusion,
      });
      fairnessMetricsTables.push(table);
      totalExcluded += table.groups.filter((g) => g.excluded).length;
    }
  } else {
    throw new Error(`Unknown metric mode: ${metric}`);
  }

  // Score distributions run whenever score data is present, regardless of metric.
  if (records.some((r) => scoreValue(r, RECORD_KEYS.score) !== null)) {
    for (const [categoryKey, categoryConfig] of Object.entries(config.categories)) {
      const distTable = computeScoreDistributionTable({
        records,
        categoryKey,
        categoryLabel: categoryConfig.label,
      });
      if (distTable.groups.length > 0) scoreDistributionTables.push(distTable);
    }
  }

  const degenerateMedian =
    metric === "scoring_rate" ? detectDegenerateMedian(records, RECORD_KEYS.score) : null;

  const summaryParts = [
    `Audit analyzed ${withThousands(totalApplicants)} applicants ` +
      `(overall rate: ${formatPercent(overallRate)}).`,
  ];
  if (unknownCount > 0) {
    summaryParts.push(`${withThousands(unknownCount)} rows excluded due to missing data.`);
  }

  if (degenerateMedian) {
    // The one divergence. EvalServer emits "No adverse impact flags detected"
    // here, which reads as a clean result for a computation that did not
    // happen: the median coincided with a modal value, so almost nothing
    // scores above it and every ratio collapses.
    const d = degenerateMedian;
    if (d.kind === "none_above") {
      summaryParts.push(
        `No scoring rate could be computed: the sample median (${d.median}) is also the ` +
          `highest observed value for ${withThousands(d.atMedian)} of ` +
          `${withThousands(d.total)} records, across only ${d.distinctValues} distinct ` +
          `values, so no record scores above it.`,
      );
    } else {
      summaryParts.push(
        `Scoring rates rest on only ${withThousands(d.above)} of ${withThousands(d.total)} ` +
          `records clearing the sample median (${d.median}), below the ` +
          `${formatPercent(d.floor)} floor, so the ratios are not a reliable basis for conclusions.`,
      );
    }
  } else if (metric === "selection_rate" || metric === "scoring_rate") {
    // The second divergence. A table whose highest rate is zero has no
    // reference group, so it holds no ratios and therefore no flags; the
    // Python still reports "No adverse impact flags detected" for it.
    const noReference = tables.filter((t) => !t.highestRate);
    if (totalFlags > 0) {
      summaryParts.push(
        `${totalFlags} group(s) flagged with impact ratio below ` +
          `${twoDecimals(config.threshold || 0.8)} threshold.`,
      );
    }
    if (tables.length === 0) {
      summaryParts.push("No impact ratios were computed: no protected category is configured.");
    } else if (noReference.length > 0) {
      const titles = noReference.map((t) => t.title.charAt(0).toLowerCase() + t.title.slice(1));
      summaryParts.push(
        `No impact ratio could be computed for ${titles.join("; ")}: ` +
          `no group with a value has a non-zero rate.`,
      );
    } else if (totalFlags === 0) {
      summaryParts.push("No adverse impact flags detected.");
    }
  }

  if (totalExcluded > 0) {
    summaryParts.push(
      `${totalExcluded} group(s) excluded from calculations due to small sample size.`,
    );
  }

  return {
    metric,
    tables,
    scoreDistributionTables,
    fairnessMetricsTables,
    overallSelectionRate: round6(overallRate),
    overallMedian: median,
    totalApplicants,
    totalSelected,
    unknownCount,
    flagsCount: totalFlags,
    excludedCount: totalExcluded,
    summary: summaryParts.join(" "),
    diagnostics: { degenerateMedian },
  };
}
