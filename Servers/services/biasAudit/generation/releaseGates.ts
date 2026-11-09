import { cellKey, LL144_CELLS, MIN_PER_CELL } from "./allocation";
import { GENERATED_MIN_RUN_FRACTION, type IdOrderChecks } from "./assignCandidateIds";

export interface ReleaseFinding {
  code: string;
  severity: "stop" | "warn";
  message: string;
}

export interface ReleaseGateArgs {
  jobDescriptionKey: string;
  /** Distinct candidates with a valid latest record in the log. */
  recordCount: number;
  manifestRowCount: number;
  /**
   * measureIdOrder on the MANIFEST rows in candidate-ID order, not the plan:
   * records that never validated drop out, and the gate runs on output.
   */
  idOrderChecks: IdOrderChecks;
  /** buildManifest().cellSizes, keyed sex|race. */
  cellSizes: Record<string, number>;
  modelsObserved: Record<string, number>;
  criteriaVerdict: "close" | "divergent" | "not_supplied";
}

/**
 * The checks a generated corpus must clear before it can be downloaded.
 * Stops block the corpus; warnings are stored beside it. Tier separation is
 * not checked here: it needs scores, which exist only after the customer
 * scores the corpus.
 */
export function runReleaseGates(args: ReleaseGateArgs): ReleaseFinding[] {
  const findings: ReleaseFinding[] = [];

  for (const [attribute, check] of Object.entries(args.idOrderChecks)) {
    if (check.fraction < GENERATED_MIN_RUN_FRACTION) {
      findings.push({
        code: "id_order_blocked",
        severity: "stop",
        message:
          `Candidate IDs are blocked on ${attribute}: ${Math.round(check.observed)} runs observed, ` +
          `about ${Math.round(check.expected)} expected (${check.fraction.toFixed(3)} of expected, ` +
          `minimum ${GENERATED_MIN_RUN_FRACTION}).`,
      });
    }
  }

  if (args.manifestRowCount !== args.recordCount) {
    findings.push({
      code: "manifest_count_mismatch",
      severity: "stop",
      message: `The manifest has ${args.manifestRowCount} rows but the corpus holds ${args.recordCount} valid records.`,
    });
  }

  for (const cell of LL144_CELLS) {
    const key = cellKey(cell);
    const size = args.cellSizes[key] ?? 0;
    if (size < MIN_PER_CELL) {
      findings.push({
        code: "cell_too_small",
        severity: "stop",
        message: `Cell ${key} holds ${size} valid records, under the minimum of ${MIN_PER_CELL} needed to report a ratio.`,
      });
    }
  }

  const models = Object.keys(args.modelsObserved);
  if (models.length > 1) {
    findings.push({
      code: "multiple_models",
      severity: "warn",
      message: `The corpus came from ${models.length} models (${models.join(", ")}), which is not one configuration.`,
    });
  }

  if (args.criteriaVerdict === "divergent") {
    findings.push({
      code: "criteria_divergent",
      severity: "warn",
      message:
        "The supplied criteria diverge materially from the expected set for this job description.",
    });
  }

  return findings;
}
