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
  getCorpusQuery,
  getProfileAnswersQuery,
  getRunQuery,
  listRunsQuery,
  listStancesForRunQuery,
  listTrendRunsQuery,
  type CorpusRow,
  type RunSummaryRow,
} from "../../utils/biasAudit.utils";
import { findJobDescription } from "../../structures/NYC-Local-Law-144/job-descriptions";
import type { JobDescription } from "../../structures/NYC-Local-Law-144/job-descriptions/types";
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
import { LL144_RACE, LL144_SEX } from "./generation/allocation";
import { runAudit, RECORD_KEYS } from "./index";
import type { AuditOutcome, BiasAuditConfig } from "./index";
import { mayExportStoredRun, type GateFinding } from "./dataGates";
import { CORPUS_ID_KEY, joinScoresToManifest, tierSeparationFindings } from "./corpusJoin";
import { sameJobDescription } from "./jobDescription";
import type { ManifestRow } from "./generation/manifest";
import { jobDescriptionSha256 } from "./generation/generateCorpus";
import { buildTrendSeries, type TrendSeries } from "./trendSeries";

export { mayExportStoredRun };

/** The 0.8 figure is a convention the rule's guidance uses, not a statutory value. */
export const LL144_THRESHOLD_SOURCE = "convention";

/** The LL 144 configuration. The metric is set per run from the cutoff answer. */
export const LL144_CONFIG: BiasAuditConfig = {
  presetId: "nyc_ll144",
  metric: "selection_rate",
  categories: {
    sex: { label: "Sex", groups: [...LL144_SEX] },
    race_ethnicity: {
      label: "Race/Ethnicity",
      groups: [...LL144_RACE],
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
  /** The job description tested, as a key (jobDescription.ts); null when not given. */
  jobDescriptionKey: string | null;
  /**
   * The generated corpus the file was scored from; null or absent for
   * uploaded data. A corpus run maps only the candidate ID and the outcome:
   * sex and race/ethnicity come from the corpus manifest.
   */
  corpusId?: number | null;
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

/**
 * The corpus a scored file came from: in this organization and project, and
 * complete. Another project's corpus is reported as not found, like another
 * organization's.
 */
async function loadRunCorpus(
  corpusId: number,
  projectId: number,
  organizationId: number,
): Promise<{ corpus: CorpusRow; jobDescription: JobDescription; manifest: ManifestRow[] }> {
  const corpus = await getCorpusQuery(corpusId, organizationId);
  if (!corpus || corpus.project_id !== projectId) {
    throw new NotFoundException(`Corpus ${corpusId} was not found.`, "AedtCorpus", corpusId);
  }
  if (corpus.status !== "complete" || !Array.isArray(corpus.manifest_json)) {
    throw new ConflictException(
      `Corpus ${corpusId} is not complete, so a scored file cannot be joined to it.`,
      "AedtCorpus",
      String(corpusId),
    );
  }
  const jobDescription = findJobDescription(corpus.job_description_key);
  if (!jobDescription) {
    throw new ConflictException(
      `Corpus ${corpusId} names a job description this deployment does not hold.`,
      "AedtCorpus",
      String(corpusId),
    );
  }
  // The run names the fixed text and reads its tiers, so they must be the
  // ones the corpus was built from, as generation itself checks.
  if (jobDescriptionSha256(jobDescription) !== corpus.job_description_sha256) {
    throw new ConflictException(
      `The fixed job description has changed since corpus ${corpusId} was generated, so a ` +
        `scored file cannot be joined to it. Generate a new corpus from the current text.`,
      "AedtCorpus",
      String(corpusId),
    );
  }
  return { corpus, jobDescription, manifest: corpus.manifest_json as ManifestRow[] };
}

/** The rule's expiry is one year from the audit date (5-301(a)). */
function oneYearFromToday(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createRun(input: CreateRunInput): Promise<CreateRunResult> {
  const { projectId, frameworkId, organizationId, userId, role, data, mapping, jobDescriptionKey } =
    input;
  const corpusId = input.corpusId ?? null;
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

  const corpusSource =
    corpusId === null ? null : await loadRunCorpus(corpusId, projectId, organizationId);
  // A corpus run takes the fixed role title as its job description; a typed
  // title that names a different job is refused rather than overridden.
  let runJobDescription = jobDescriptionKey;
  if (corpusSource) {
    const roleTitle = corpusSource.jobDescription.roleTitle;
    if (jobDescriptionKey !== null && !sameJobDescription(jobDescriptionKey, roleTitle)) {
      throw new ValidationException(
        `The corpus was built from the fixed job description for ${roleTitle}, so the run ` +
          `cannot name a different job description.`,
        "jobDescription",
        jobDescriptionKey,
      );
    }
    runJobDescription = roleTitle;
  }

  // Only keys the engine reads may be mapped. A corpus run maps the candidate
  // ID instead of the categories, which the corpus manifest supplies.
  const outcomeKey = metric === "scoring_rate" ? RECORD_KEYS.score : RECORD_KEYS.selected;
  const allowed = new Set<string>(
    corpusSource
      ? [CORPUS_ID_KEY, outcomeKey]
      : [...Object.keys(LL144_CONFIG.categories), outcomeKey],
  );
  for (const key of Object.keys(mapping)) {
    if (!allowed.has(key)) {
      const reason =
        corpusSource && key in LL144_CONFIG.categories
          ? `"${key}" cannot be mapped for a corpus run: the corpus supplies sex and race/ethnicity.`
          : `"${key}" is not a column the module reads for this run.`;
      throw new ValidationException(
        `${reason} Mappable keys: ${[...allowed].join(", ")}.`,
        "mapping",
        key,
      );
    }
  }
  if (corpusSource && !(CORPUS_ID_KEY in mapping)) {
    throw new ValidationException(
      `Map "${CORPUS_ID_KEY}" to the column holding each record's candidate ID.`,
      "mapping",
      CORPUS_ID_KEY,
    );
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

  // A readable scored corpus is joined to its manifest before anything is
  // computed; a refused join stores no run, since the rates would describe
  // other candidates than the corpus holds. A file the checks above already
  // stopped is stored as a blocked run instead, so its real cause shows.
  let records = parsed.records;
  let tierFindings: GateFinding[] = [];
  if (corpusSource && blockers.length === 0) {
    const joined = joinScoresToManifest(parsed.records, corpusSource.manifest);
    if (!joined.ok) {
      throw new ValidationException(
        joined.findings.map((f) => f.message).join(" "),
        "csv",
        joined.findings.map((f) => f.code),
      );
    }
    // Every corpus record was meant to be scored; an unscored one would leave
    // the rates describing part of the corpus while the stance names all of it.
    const unscored =
      metric === "scoring_rate"
        ? parsed.records.filter((r) => typeof r[RECORD_KEYS.score] !== "number").length
        : 0;
    if (unscored > 0) {
      throw new ValidationException(
        `${unscored} record(s) of the corpus have no score. Score every record of the corpus ` +
          `and upload the whole file.`,
        "csv",
        "corpus_scores_blank",
      );
    }
    tierFindings = tierSeparationFindings(
      parsed.records,
      corpusSource.manifest,
      metric,
      corpusSource.jobDescription.tiers.map((t) => t.key),
      Object.fromEntries(corpusSource.jobDescription.tiers.map((t) => [t.key, t.label])),
    );
    records = joined.records;
  }

  const computed = blockers.length > 0 ? blockedOutcome(blockers) : runAudit(records, config);
  const outcome: AuditOutcome =
    blockers.length > 0 || tierFindings.length === 0
      ? computed
      : {
          ...computed,
          gates: { ...computed.gates, findings: [...computed.gates.findings, ...tierFindings] },
        };

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
        jobDescriptionKey: runJobDescription,
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
        corpusId,
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

export async function listRuns(scope: ProjectScope): Promise<{ runs: RunSummaryRow[] }> {
  await assertProject(scope.projectId, scope.organizationId, scope);
  return {
    runs: await listRunsQuery(scope.projectId, scope.frameworkId, scope.organizationId),
  };
}

/**
 * The lowest impact ratio per run, segmented at configuration changes. Built
 * here so a run's raw result never leaves the server through this endpoint.
 */
export async function getTrendSeries(scope: ProjectScope): Promise<TrendSeries> {
  await assertProject(scope.projectId, scope.organizationId, scope);
  return buildTrendSeries(
    await listTrendRunsQuery(scope.projectId, scope.frameworkId, scope.organizationId),
  );
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
