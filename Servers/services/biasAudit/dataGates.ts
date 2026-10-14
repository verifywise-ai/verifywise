/**
 * Input validation for a bias audit dataset.
 *
 * EvalServer has no equivalent: its dataset parser parses and does not check.
 * A clean impact ratio computed from a dataset that cannot support one is
 * more dangerous than a flagged ratio, because nobody looks at it twice.
 *
 * Two severities. A `stop` means no ratios may be shown at all. A `warn`
 * means the in-app view may show them with the finding attached, but the
 * PDF is withheld: an exported document outlives the context that explains
 * its caveats.
 *
 * Records arrive with canonical keys (see RECORD_KEYS); the dataset parser maps
 * uploaded columns onto them. The gates read the same keys the engine does.
 */
import { RECORD_KEYS, detectDegenerateMedian } from "./engine";
import type { AuditRecord, BiasAuditConfig } from "./engine";

export type GateSeverity = "stop" | "warn";

export interface GateFinding {
  code: string;
  severity: GateSeverity;
  message: string;
  detail?: Record<string, unknown>;
}

export interface GateResult {
  findings: GateFinding[];
  mayComputeRatios: boolean;
  mayExportPdf: boolean;
}

/** A demographic column present for fewer than this share of records is a stop. */
const MIN_PRESENT_FRACTION = 0.5;
/** A score column with fewer distinct values than this is too coarse. */
const MIN_DISTINCT_SCORES = 5;
/** The 2% category exclusion in NYC Admin. Code § 5-301(d). */
const STATUTORY_EXCLUSION = 0.02;

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function withThousands(n: number): string {
  return n.toLocaleString("en-US");
}

function percent(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function runDataGates(records: AuditRecord[], config: BiasAuditConfig): GateResult {
  const findings: GateFinding[] = [];
  const total = records.length;
  const categoryKeys = Object.keys(config.categories);

  // Demographic columns: majority missing, then fewer than two groups.
  for (const column of categoryKeys) {
    const values = records.map((r) => r[column]).filter((v) => !isBlank(v));
    const present = values.length;
    if (total > 0 && present / total < MIN_PRESENT_FRACTION) {
      findings.push({
        code: "demographic_column_majority_missing",
        severity: "stop",
        message:
          `The "${column}" column has a value for ${withThousands(present)} of ` +
          `${withThousands(total)} records. Rates for a column that is mostly blank ` +
          `do not describe the applicant pool, so no ratios are shown.`,
        detail: { column, present, total },
      });
    }
    const distinct = new Set(values.map((v) => String(v))).size;
    if (distinct < 2) {
      findings.push({
        code: "fewer_than_two_groups",
        severity: "stop",
        message:
          `The "${column}" column has ${distinct} distinct group(s) with data. ` +
          `An impact ratio compares groups, so at least two are needed.`,
        detail: { column, distinctGroups: distinct },
      });
    }
  }

  // Selection rate: every record selected or none.
  if (config.metric === "selection_rate" && total > 0) {
    const selected = records.filter((r) => Boolean(r[RECORD_KEYS.selected])).length;
    if (selected === 0 || selected === total) {
      findings.push({
        code: "all_or_none_selected",
        severity: "stop",
        message:
          selected === total
            ? `All ${withThousands(total)} records are selected. Every group has the same rate, so there is nothing to compare.`
            : `None of the ${withThousands(total)} records is selected. Every group has a rate of zero, so there is nothing to compare.`,
        detail: { column: RECORD_KEYS.selected, selected, total },
      });
    }
  }

  // Scoring rate: score granularity and the degenerate median.
  if (config.metric === "scoring_rate") {
    const values = records
      .map((r) => r[RECORD_KEYS.score])
      .filter((v) => !isBlank(v))
      .map(Number)
      .filter((v) => Number.isFinite(v));
    const distinctValues = new Set(values).size;
    if (values.length > 0 && distinctValues < MIN_DISTINCT_SCORES) {
      findings.push({
        code: "score_granularity_low",
        severity: "warn",
        message:
          `The score column has ${distinctValues} distinct value(s). With so few values ` +
          `many records tie at the median, and a rate defined as scoring above it ` +
          `depends heavily on where the ties fall.`,
        detail: { column: RECORD_KEYS.score, distinctValues },
      });
    }

    const degenerate = detectDegenerateMedian(records, RECORD_KEYS.score);
    if (degenerate) {
      const stats =
        `${withThousands(degenerate.above)} of ${withThousands(degenerate.total)} records ` +
        `(${percent(degenerate.aboveFraction)}) score above the sample median ` +
        `(${degenerate.median}), across ${degenerate.distinctValues} distinct values`;
      findings.push({
        code: "degenerate_median",
        severity: "stop",
        message:
          degenerate.kind === "none_above"
            ? `${stats}. No scoring rate can be computed from this dataset.`
            : `${stats}, under the ${percent(degenerate.floor)} floor. ` +
              `Ratios resting on so few records are not a reliable basis for conclusions.`,
        detail: { column: RECORD_KEYS.score, ...degenerate },
      });
    }
  }

  // Observed intersectional cells under the statutory 2%, with no exclusion applied.
  const exclusionApplied = Boolean(config.smallSampleExclusion);
  if (
    !exclusionApplied &&
    total > 0 &&
    config.intersectional.required &&
    config.intersectional.cross.length >= 2
  ) {
    const counts = new Map<string, number>();
    for (const r of records) {
      const parts = config.intersectional.cross.map((k) => r[k]);
      if (parts.some(isBlank)) continue;
      const key = parts.map(String).join(" / ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const small = [...counts.entries()]
      .filter(([, n]) => n / total < STATUTORY_EXCLUSION)
      .map(([cell, n]) => ({ cell, count: n, fraction: n / total }));
    if (small.length > 0) {
      findings.push({
        code: "cell_below_statutory_exclusion",
        severity: "warn",
        message:
          `${small.length} intersectional cell(s) hold under 2% of records. ` +
          `§ 5-301(d) permits excluding a category under 2%, and no exclusion is applied here, ` +
          `so these small cells are reported as they stand.`,
        detail: { cells: small, total },
      });
    }
  }

  return {
    findings,
    mayComputeRatios: !findings.some((f) => f.severity === "stop"),
    mayExportPdf: findings.length === 0,
  };
}
