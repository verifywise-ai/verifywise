/**
 * Ratios across runs, segmented wherever a comparison is not supported.
 *
 * A line drawn across a changed profile, job description, question set or
 * metric asserts that the runs on either side measured the same thing, and
 * nobody established that. So the series breaks there, and the break is
 * labelled with what changed. A gap the customer has to explain is preferable
 * to a line they will misread.
 *
 * Pure: the caller supplies the runs oldest first (listTrendRunsQuery orders
 * by created_at, then id, at the database's precision) and the order is kept
 * as given. Raw results never leave the server; only the series built here
 * does.
 */

import { mayExportStoredRun } from "./dataGates";
import { sameJobDescription } from "./jobDescription";

/**
 * The fields of a run the series reads. `utils/biasAudit.utils` `TrendRunRow`
 * has this shape; it is restated here because this file imports nothing from
 * outside the module.
 */
export interface TrendRun {
  id: number;
  created_at: Date | string;
  profile_version: number;
  question_set_version: number;
  job_description_key: string | null;
  metric: string;
  /** The stored result's `tables`; null when no result was stored. */
  tables: unknown;
  /** The stored result's `metric`; null when no result was stored. */
  result_metric: string | null;
  gate_findings_json: unknown;
}

export interface TrendPoint {
  runId: number;
  /** ISO 8601 when the run was recorded as a Date; otherwise as stored. */
  date: string;
  /**
   * The `categoryKey` of the table holding the lowest ratio. Null when the
   * run produced no ratio at all, since then no table holds a lowest one.
   */
  category: string | null;
  /** The lowest impact ratio of any non-excluded group in any table. */
  lowestRatio: number | null;
  /** Whether any non-excluded group in any table was flagged. */
  flagged: boolean;
  /**
   * True when the run's data checks did not clear it for export (the rule
   * stances use, `mayExportStoredRun`): its ratio is shown with that caveat.
   */
  caveat: boolean;
}

export interface TrendSegment {
  profileVersion: number;
  questionSetVersion: number;
  jobDescriptionKey: string | null;
  metric: string;
  points: TrendPoint[];
}

export interface TrendBreak {
  /** The last run plotted before the break. */
  afterRunId: number;
  reasons: string[];
}

export interface TrendSeries {
  segments: TrendSegment[];
  breaks: TrendBreak[];
}

const BREAK_REASONS = {
  profileVersion: "the AEDT profile was changed",
  questionSetVersion: "the question set was revised",
  jobDescriptionKey: "a different job description was tested",
} as const;

/** Each measure in plain words, in the order a metric reason names them. */
const MEASURE_NAMES: Array<[string, string]> = [
  ["selection_rate", "a selection rate"],
  ["scoring_rate", "a scoring rate"],
  ["fairness_metrics", "fairness metrics"],
];

function measureName(metric: string): string {
  return MEASURE_NAMES.find(([key]) => key === metric)?.[1] ?? `the measure "${metric}"`;
}

function measureOrder(metric: string): number {
  const i = MEASURE_NAMES.findIndex(([key]) => key === metric);
  return i === -1 ? MEASURE_NAMES.length : i;
}

/**
 * Names a metric change for any pair, the same either way round:
 * "the measure changed between a selection rate and a scoring rate".
 */
export function metricChangeReason(from: string, to: string): string {
  const [a, b] = [from, to].sort((x, y) => measureOrder(x) - measureOrder(y) || x.localeCompare(y));
  return `the measure changed between ${measureName(a)} and ${measureName(b)}`;
}

interface RowShape {
  impactRatio?: unknown;
  flagged?: unknown;
  excluded?: unknown;
}

interface TableShape {
  categoryKey?: unknown;
  rows?: unknown;
}

/**
 * The point a run contributes, or null when it contributes none.
 *
 * No point:
 *  - no result (the data checks withheld the figures). An absence of
 *    measurement, not a change of configuration, so the series does not
 *    break either.
 *  - a `fairness_metrics` run. It computes confusion-matrix rates per group
 *    (`fairnessMetricsTables`) and no impact ratio at all (`tables` is empty),
 *    so any ratio drawn for it would be invented. It is left out rather than
 *    plotted as a null, and, having no point, it neither opens nor closes a
 *    segment: the impact-ratio runs either side of it are compared directly.
 *
 * A null-ratio point: a selection or scoring run whose tables hold no
 * non-null ratio (no reference group, every group excluded, or no category).
 * It was measured and produced nothing to plot, which the chart shows as a
 * gap within its segment.
 */
function pointOf(run: TrendRun): TrendPoint | null {
  if (run.metric === "fairness_metrics" || run.result_metric === "fairness_metrics") return null;
  if (!Array.isArray(run.tables)) return null;

  let lowestRatio: number | null = null;
  let category: string | null = null;
  let flagged = false;
  for (const table of run.tables as TableShape[]) {
    if (!table || !Array.isArray(table.rows)) continue;
    for (const row of table.rows as RowShape[]) {
      // An excluded group (5-301(d)) has no ratio, so it is never the lowest
      // and its flag, if any, is not counted.
      if (!row || row.excluded === true) continue;
      if (row.flagged === true) flagged = true;
      const ratio = row.impactRatio;
      if (typeof ratio !== "number" || !Number.isFinite(ratio)) continue;
      if (lowestRatio === null || ratio < lowestRatio) {
        lowestRatio = ratio;
        category = typeof table.categoryKey === "string" ? table.categoryKey : null;
      }
    }
  }

  return {
    runId: run.id,
    date: dateOf(run.created_at),
    category,
    lowestRatio,
    flagged,
    caveat: !mayExportStoredRun(run.gate_findings_json),
  };
}

function dateOf(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function reasonsBetween(segment: TrendSegment, run: TrendRun): string[] {
  const reasons: string[] = [];
  if (segment.profileVersion !== run.profile_version) reasons.push(BREAK_REASONS.profileVersion);
  if (segment.questionSetVersion !== run.question_set_version) {
    reasons.push(BREAK_REASONS.questionSetVersion);
  }
  if (!sameJobDescription(segment.jobDescriptionKey ?? null, run.job_description_key ?? null)) {
    reasons.push(BREAK_REASONS.jobDescriptionKey);
  }
  if (segment.metric !== run.metric) reasons.push(metricChangeReason(segment.metric, run.metric));
  return reasons;
}

/**
 * Expects `runs` oldest first, as listTrendRunsQuery returns them. It does not
 * sort: the database orders by the full timestamp, then id, and a re-sort here
 * at millisecond precision could reverse runs recorded within a millisecond.
 */
export function buildTrendSeries(runs: readonly TrendRun[]): TrendSeries {
  const segments: TrendSegment[] = [];
  const breaks: TrendBreak[] = [];
  for (const run of runs) {
    const point = pointOf(run);
    if (!point) continue;
    const current = segments[segments.length - 1];
    const reasons = current ? reasonsBetween(current, run) : [];
    if (current && reasons.length === 0) {
      current.points.push(point);
      continue;
    }
    if (current) {
      breaks.push({ afterRunId: current.points[current.points.length - 1].runId, reasons });
    }
    segments.push({
      profileVersion: run.profile_version,
      questionSetVersion: run.question_set_version,
      jobDescriptionKey: run.job_description_key ?? null,
      metric: run.metric,
      points: [point],
    });
  }
  return { segments, breaks };
}
