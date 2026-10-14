/**
 * Input validation for a bias audit dataset.
 *
 * EvalServer has no equivalent: its dataset parser parses and does not check.
 * A clean impact ratio computed from a dataset that cannot support one is
 * more dangerous than a flagged ratio, because nobody looks at it twice.
 *
 * Three severities. A `stop` means no ratios may be shown at all. A `warn`
 * means the in-app view may show them with the finding attached, but the
 * PDF is withheld: an exported document outlives the context that explains
 * its caveats. A `note` reports a fact the result must carry (such as the
 * § 5-301(c) count of records in an unknown category) and withholds nothing.
 *
 * Records arrive with canonical keys (see RECORD_KEYS); the dataset parser maps
 * uploaded columns onto them. The gates read the same keys the engine does.
 */
import { RECORD_KEYS, detectDegenerateMedian, groupValue } from "./engine";
import type { AuditRecord, BiasAuditConfig } from "./engine";

export type GateSeverity = "stop" | "warn" | "note";

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

/** Blank score values; demographic values use the engine's `groupValue`. */
const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function withThousands(n: number): string {
  return n.toLocaleString("en-US");
}

function percent(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export interface UnknownCounts {
  /** Records blank in at least one configured category. */
  unknownRecords: number;
  /** Blank records per configured category. */
  byColumn: Record<string, number>;
}

/**
 * Records whose value is blank for a configured category: the count
 * § 5-301(c) requires to be reported as assessed but in an unknown category.
 */
export function countUnknown(records: AuditRecord[], config: BiasAuditConfig): UnknownCounts {
  const keys = Object.keys(config.categories);
  const byColumn: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  let unknownRecords = 0;
  for (const r of records) {
    let blank = false;
    for (const k of keys) {
      if (groupValue(r, k) === null) {
        byColumn[k] += 1;
        blank = true;
      }
    }
    if (blank) unknownRecords += 1;
  }
  return { unknownRecords, byColumn };
}

export function runDataGates(records: AuditRecord[], config: BiasAuditConfig): GateResult {
  const findings: GateFinding[] = [];
  const total = records.length;
  const categoryKeys = Object.keys(config.categories);

  // Demographic columns: majority missing, then fewer than two groups.
  for (const column of categoryKeys) {
    const values = records.map((r) => groupValue(r, column)).filter((v) => v !== null);
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
    const distinct = new Set(values).size;
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

  // Records blank in a category: reported, never silently dropped.
  const unknown = countUnknown(records, config);
  if (unknown.unknownRecords > 0) {
    findings.push({
      code: "demographic_values_missing",
      severity: "note",
      message:
        `${withThousands(unknown.unknownRecords)} of ${withThousands(total)} records have no value ` +
        `for at least one protected category. They are left out of that category's rates and ` +
        `reported as an unknown category, as § 5-301(c) requires.`,
      detail: { ...unknown, total },
    });
  }

  // Selection rate: every record selected or none, across the file and then
  // within each category, counting only the records that carry a value.
  if (config.metric === "selection_rate" && total > 0) {
    const isSelected = (r: AuditRecord) => Boolean(r[RECORD_KEYS.selected]);
    const selected = records.filter(isSelected).length;
    const fileWide = selected === 0 || selected === total;
    if (fileWide) {
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

    const scopes: Array<[string, (r: AuditRecord) => boolean]> = categoryKeys.map((k) => [
      k,
      (r) => groupValue(r, k) !== null,
    ]);
    if (config.intersectional.required && config.intersectional.cross.length >= 2) {
      const cross = config.intersectional.cross;
      scopes.push(["intersectional", (r) => cross.every((k) => groupValue(r, k) !== null)]);
    }
    for (const [column, hasValue] of fileWide ? [] : scopes) {
      const withValueRecords = records.filter(hasValue);
      const withValue = withValueRecords.length;
      if (withValue === 0) continue; // already a stop above
      const selectedHere = withValueRecords.filter(isSelected).length;
      if (selectedHere === 0 || selectedHere === withValue) {
        findings.push({
          code: "all_or_none_selected",
          severity: "stop",
          message:
            `Among the ${withThousands(withValue)} records with a value for "${column}", ` +
            (selectedHere === 0 ? "none is selected" : "all are selected") +
            `. Every group in that category has the same rate, so there is nothing to compare.`,
          detail: { column, selected: selectedHere, withValue, total },
        });
      }
    }
  }

  // Fairness metrics: the engine needs both columns on at least one record.
  if (
    config.metric === "fairness_metrics" &&
    !records.some((r) => RECORD_KEYS.prediction in r && RECORD_KEYS.groundTruth in r)
  ) {
    findings.push({
      code: "fairness_columns_missing",
      severity: "stop",
      message:
        `Fairness metrics need a "${RECORD_KEYS.prediction}" and a "${RECORD_KEYS.groundTruth}" ` +
        `value on each record, and no record carries both.`,
      detail: { columns: [RECORD_KEYS.prediction, RECORD_KEYS.groundTruth] },
    });
  }

  // Scoring rate: score granularity and the degenerate median.
  if (config.metric === "scoring_rate") {
    const values = records
      .map((r) => r[RECORD_KEYS.score])
      .filter((v) => !isBlank(v))
      .map(Number)
      .filter((v) => Number.isFinite(v));
    const distinctValues = new Set(values).size;
    if (values.length === 0) {
      findings.push({
        code: "score_column_empty",
        severity: "stop",
        message:
          `No record has a numeric value in the "${RECORD_KEYS.score}" column, ` +
          `so no scoring rate can be computed.`,
        detail: { column: RECORD_KEYS.score },
      });
    } else if (distinctValues < MIN_DISTINCT_SCORES) {
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
      const parts = config.intersectional.cross.map((k) => groupValue(r, k));
      if (parts.some((p) => p === null)) continue;
      const key = parts.join(" / ");
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
    mayExportPdf: !findings.some((f) => f.severity !== "note"),
  };
}
