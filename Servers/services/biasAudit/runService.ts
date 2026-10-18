/**
 * Runs the LL 144 bias-audit engine against an uploaded dataset and stores
 * the run.
 *
 * The module records the customer's determination and makes none of its own.
 * A run is attached to the attested profile, takes its metric from the cutoff
 * answer, and stores its gate findings whether or not a result was computed,
 * so a blocked run is a record rather than an absence. The dataset itself is
 * hashed and not retained.
 */
import { createHash } from "node:crypto";
import { sequelize } from "../../database/db";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  confirmRunDerivedBasisQuery,
  createRunQuery,
  getAttestedProfileQuery,
  getProfileAnswersQuery,
  getRunQuery,
  listRunsQuery,
  listStancesForRunQuery,
  listTrendRunsQuery,
  type RunSummaryRow,
  type TrendRunRow,
} from "../../utils/biasAudit.utils";
import type { BiasAuditRun } from "../../domain.layer/models/biasAudit/biasAuditRun.model";
import type { BiasAuditStance } from "../../domain.layer/models/biasAudit/biasAuditStance.model";
import { applicableQuestions } from "./applicability";
import { assertProjectAccess, runNotFound, type Viewer } from "./projectAccess";
import { answerMapFromRows, assertProject } from "./serviceHelpers";
import { runAnswerGates } from "./answerGates";
import { runMetricOf } from "./profileDecision";
import { deriveBasis } from "./deriveBasis";
import { computeReadiness, type ReadinessResult } from "./readinessScore";
import { DatasetParseError, parseDataset, type ParsedDataset } from "./datasetParser";
import { runAudit, RECORD_KEYS } from "./index";
import type { AuditOutcome, BiasAuditConfig } from "./index";
import type { GateFinding } from "./dataGates";

/** The 0.8 figure is a convention the rule's guidance uses, not a statutory value. */
export const LL144_THRESHOLD_SOURCE = "convention";

/** The LL 144 configuration. The metric is set per run from the cutoff answer. */
export const LL144_CONFIG: BiasAuditConfig = {
  presetId: "nyc_ll144",
  metric: "selection_rate",
  categories: {
    sex: { label: "Sex", groups: ["Male", "Female"] },
    race_ethnicity: {
      label: "Race/Ethnicity",
      groups: [
        "Hispanic or Latino",
        "White",
        "Black or African American",
        "Native Hawaiian or Pacific Islander",
        "Asian",
        "Native American or Alaska Native",
        "Two or more races",
      ],
    },
  },
  intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
  threshold: 0.8,
  smallSampleExclusion: 0.02,
  outcomeColumn: RECORD_KEYS.selected,
  scoreColumn: RECORD_KEYS.score,
  predictionColumn: null,
  groundTruthColumn: null,
};

export interface CreateRunInput {
  projectId: number;
  frameworkId: number;
  organizationId: number;
  userId: number;
  /** The caller's role, for the project-member rule (projectAccess.ts). */
  role: string;
  /**
   * The uploaded file exactly as received. It is hashed as bytes, so a
   * customer who hashes their own copy gets the SHA-256 the stance prints,
   * BOM and encoding included; it is decoded as UTF-8 only for reading.
   */
  data: Buffer;
  /** Canonical key (a category key, `selected` or `score`) to the file's column header. */
  mapping: Record<string, string>;
}

export interface CreateRunResult {
  runId: number;
  readiness: ReadinessResult;
  outcome: AuditOutcome;
}

function stop(code: string, message: string, detail: Record<string, unknown> = {}): GateFinding {
  return { code, severity: "stop", message, detail };
}

/** A run that could not compute: findings stored, nothing exportable. */
function blockedOutcome(findings: GateFinding[]): AuditOutcome {
  return {
    gates: { findings, mayComputeRatios: false, mayExportPdf: false },
    order: [],
    result: null,
  };
}

/** The rule's expiry is one year from the audit date (5-301(a)). */
function oneYearFromToday(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createRun(input: CreateRunInput): Promise<CreateRunResult> {
  const { projectId, frameworkId, organizationId, userId, role, data, mapping } = input;
  await assertProjectAccess(projectId, organizationId, { userId, role });

  const profile = await getAttestedProfileQuery(projectId, frameworkId, organizationId);
  if (!profile) {
    throw new NotFoundException(
      "There is no attested profile for this project, so a run cannot be recorded against it. " +
        "Attest the profile first.",
      "AedtProfile",
    );
  }

  const answers = answerMapFromRows(
    await getProfileAnswersQuery(profile.id!, organizationId),
    "without_notes",
  );
  const readiness = computeReadiness(answers);
  const answerGates = runAnswerGates(answers);
  // The same reading the profile view reports as the attested decision.
  const metric = runMetricOf(answerGates);

  // Both refusals come from the attested profile's state, not the upload, so
  // they are 409s, apart from the 400s of a bad file or mapping. The page
  // refetches the profile on a 409 to show the state that refused the run.
  if (metric === null) {
    const cutoffShown = applicableQuestions(answers).some((q) => q.key === "cutoff.applied_by");
    if (!cutoffShown) {
      throw new ConflictException(
        "The attested profile records this tool as outside the rule's scope, so the module " +
          "does not run its measures against it.",
        "AedtProfile",
        "scope.weighting",
      );
    }
    throw new ConflictException(
      "The cutoff answer in the attested profile does not establish which metric applies " +
        "(selection rate or scoring rate), so a run cannot be started. Answer cutoff.applied_by " +
        "and attest again.",
      "AedtProfile",
      "cutoff.applied_by",
    );
  }

  // Only keys the engine reads may be mapped.
  const allowed = new Set<string>([
    ...Object.keys(LL144_CONFIG.categories),
    metric === "scoring_rate" ? RECORD_KEYS.score : RECORD_KEYS.selected,
  ]);
  for (const key of Object.keys(mapping)) {
    if (!allowed.has(key)) {
      throw new ValidationException(
        `"${key}" is not a column the module reads for this run. Mappable keys: ${[...allowed].join(", ")}.`,
        "mapping",
        key,
      );
    }
  }

  let parsed: ParsedDataset;
  try {
    parsed = parseDataset(data.toString("utf8"), mapping);
  } catch (error: unknown) {
    if (error instanceof DatasetParseError) {
      throw new ValidationException(error.message, "csv");
    }
    throw error;
  }
  const config: BiasAuditConfig = { ...LL144_CONFIG, metric };

  const blockers: GateFinding[] = [];
  const outcomeKey = metric === "scoring_rate" ? RECORD_KEYS.score : RECORD_KEYS.selected;
  if (!(outcomeKey in mapping)) {
    blockers.push(
      stop(
        "mapping_outcome_key_absent",
        `The column mapping has no entry for "${outcomeKey}", which this run needs. ` +
          `Map "${outcomeKey}" to a column of the file; the file itself may be fine.`,
        { key: outcomeKey },
      ),
    );
  }
  for (const message of parsed.mappingErrors) {
    blockers.push(stop("mapping_column_absent", message));
  }
  if (parsed.wrongWidthRowCount > 0) {
    blockers.push(
      stop(
        "rows_wrong_width",
        `${parsed.wrongWidthRowCount} row(s) are missing a value under a named column, or ` +
          `have a value past the last named column, so their values could be read under the ` +
          `wrong columns. Check those rows for missing or extra commas; if the file has a ` +
          `column without a header name, name it or remove it, then upload again.`,
        { count: parsed.wrongWidthRowCount, columns: parsed.namedColumnCount },
      ),
    );
  }
  // The selection column is the outcome only for a selection-rate run. A scoring
  // run cannot map it today, but these stops must not depend on that refusal.
  const outcomeIsSelection = outcomeKey === RECORD_KEYS.selected;
  if (outcomeIsSelection && parsed.blankOutcomeCount > 0) {
    blockers.push(
      stop(
        "outcome_values_blank",
        `${parsed.blankOutcomeCount} outcome value(s) are blank. A blank outcome would be counted ` +
          `as not selected, so selection rates would be wrong. Fill in the outcome for every row ` +
          `(1, 0, true, false, yes, no), or remove the rows, and upload again.`,
        { count: parsed.blankOutcomeCount },
      ),
    );
  }
  if (outcomeIsSelection && parsed.unreadableOutcomeCount > 0) {
    blockers.push(
      stop(
        "outcome_values_unreadable",
        `${parsed.unreadableOutcomeCount} outcome value(s) are neither blank nor a recognised ` +
          `yes/no value (1, 0, true, false, yes, no), so selection rates would be wrong. Fix the ` +
          `outcome column or the mapping and upload again.`,
        { count: parsed.unreadableOutcomeCount },
      ),
    );
  }
  if (parsed.unreadableScoreCount > 0) {
    blockers.push(
      stop(
        "score_values_unreadable",
        `${parsed.unreadableScoreCount} score value(s) are neither blank nor a number, so the ` +
          `scoring rate would be wrong. Fix the score column or the mapping and upload again.`,
        { count: parsed.unreadableScoreCount },
      ),
    );
  }
  if (metric === "scoring_rate" && !answerGates.mayComputeScoringRate) {
    blockers.push(
      stop(
        "answers_withhold_scoring_rate",
        `The profile answers withhold the scoring rate: ${answerGates.blocked.scoring_rate.join("; ")}.`,
        { blocked: answerGates.blocked.scoring_rate },
      ),
    );
  }
  if (!answerGates.mayComputeRatios) {
    blockers.push(
      stop(
        "answers_withhold_ratios",
        `The profile answers withhold ratios: ${answerGates.blocked.ratios.join("; ")}.`,
        { blocked: answerGates.blocked.ratios },
      ),
    );
  }

  const outcome = blockers.length > 0 ? blockedOutcome(blockers) : runAudit(parsed.records, config);

  const derived = deriveBasis(answers);
  const triggers = derived
    ? [...new Set(derived.perCategory.map((c) => c.expiryTrigger).filter((t) => t !== ""))]
    : [];

  const row = await sequelize.transaction((transaction) =>
    createRunQuery(
      {
        projectId,
        profileId: profile.id!,
        presetId: config.presetId,
        metric,
        threshold: config.threshold,
        thresholdSource: LL144_THRESHOLD_SOURCE,
        smallSampleExclusion: config.smallSampleExclusion,
        dataBasisJson: derived,
        expiryDate: oneYearFromToday(),
        expiryTrigger: triggers.length > 0 ? triggers.join(" ") : null,
        readinessScore: readiness.score,
        readinessBlockedReason: readiness.blockedReason,
        resultJson: outcome.result,
        gateFindingsJson: outcome.gates.findings,
        orderFindingsJson: outcome.order,
        datasetSha256: createHash("sha256").update(data).digest("hex"),
        datasetRetained: false,
        rowCount: parsed.records.length,
        createdBy: userId,
      },
      organizationId,
      transaction,
    ),
  );

  return { runId: row.id!, readiness, outcome };
}

// ------------------------------------------------------------------ reads

interface ProjectScope {
  projectId: number;
  frameworkId: number;
  organizationId: number;
  userId: number;
  role: string;
}

/**
 * Whether a stored run may be exported, by the rule runAudit applies to its
 * gates: only notes withhold nothing. A run that stored no findings record is
 * not known to be clean, so it fails closed.
 */
export function mayExportStoredRun(gateFindings: unknown): boolean {
  if (!Array.isArray(gateFindings)) return false;
  return (gateFindings as Array<GateFinding | null>).every((f) => f?.severity === "note");
}

export async function listRuns(scope: ProjectScope): Promise<{ runs: RunSummaryRow[] }> {
  await assertProject(scope.projectId, scope.organizationId, scope);
  return {
    runs: await listRunsQuery(scope.projectId, scope.frameworkId, scope.organizationId),
  };
}

/** Runs oldest first in the shape the trend series reads. */
export async function getTrendRows(scope: ProjectScope): Promise<{ runs: TrendRunRow[] }> {
  await assertProject(scope.projectId, scope.organizationId, scope);
  return {
    runs: await listTrendRunsQuery(scope.projectId, scope.frameworkId, scope.organizationId),
  };
}

export interface RunView {
  run: BiasAuditRun;
  stances: BiasAuditStance[];
  mayExportPdf: boolean;
}

export async function getRunView(
  runId: number,
  organizationId: number,
  viewer: Viewer,
): Promise<RunView> {
  const run = await getRunQuery(runId, organizationId);
  if (!run) throw runNotFound(runId)();
  await assertProjectAccess(run.project_id, organizationId, viewer, runNotFound(runId));
  return {
    run,
    stances: await listStancesForRunQuery(runId, organizationId),
    mayExportPdf: mayExportStoredRun(run.gate_findings_json),
  };
}

/**
 * The customer confirms the per-category basis VerifyWise derived from their
 * answers. Until then the stance presents it as our reading and lists it as
 * an open item.
 */
export async function confirmDerivedBasis(
  runId: number,
  organizationId: number,
  viewer: Viewer,
): Promise<{ runId: number; derivedBasis: unknown }> {
  const run = await getRunQuery(runId, organizationId);
  if (!run) throw runNotFound(runId)();
  await assertProjectAccess(run.project_id, organizationId, viewer, runNotFound(runId));
  const userId = viewer.userId;
  const updated = await confirmRunDerivedBasisQuery(runId, userId, organizationId);
  if (!updated) {
    throw new ConflictException(
      "This run has no derived data basis to confirm.",
      "BiasAuditRun",
      "data_basis_json",
    );
  }
  return { runId, derivedBasis: updated.data_basis_json };
}
