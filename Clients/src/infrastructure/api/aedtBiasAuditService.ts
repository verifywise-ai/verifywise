/**
 * Client for the NYC Local Law 144 (AEDT) bias audit module, `/api/bias-audit`.
 *
 * Not to be confused with `biasAuditService.ts`, which is the Evals
 * dashboard's client for `/deepeval/bias-audits/*`. The two modules coexist
 * and share nothing.
 *
 * Every request suppresses the global error toast: the module's pages show
 * the server's message inline, beside the action that was refused.
 */
import type { AxiosRequestConfig } from "axios";
import CustomAxios from "./customAxios";

// ==================== TYPES ====================

export type AedtQuestionWeight = "veto" | "high" | "standard" | "low";

export interface AedtPredicate {
  not?: AedtPredicate;
  all?: AedtPredicate[];
  any?: AedtPredicate[];
  answered?: string;
  equals?: { key: string; value: string };
}

export interface AedtOption {
  value: string;
  label: string;
  /** Shown to the customer beside the option, before they answer. */
  consequence?: string;
  emits?: Array<{ kind: string; text: string; payload?: Record<string, string> }>;
}

export interface AedtQuestion {
  key: string;
  scope: "profile" | "run";
  prompt: string;
  statutoryRef?: string;
  weight: AedtQuestionWeight;
  options: AedtOption[];
  allowDontKnow: boolean;
  notesRequired: boolean;
  notesPrompt?: string;
  appliesWhen?: AedtPredicate;
}

export interface AedtProfileAnswer {
  questionKey: string;
  value: string | null;
  notes: string | null;
  dontKnow: boolean;
  notApplicable: boolean;
  answeredByUserId: number | null;
  answeredAt: string | null;
}

export interface AedtAnswerInput {
  questionKey: string;
  value: string | null;
  notes: string | null;
  dontKnow: boolean;
}

export interface AedtReadiness {
  score: number | null;
  blockedReason: string | null;
  missingVetoes: string[];
  openItems: Array<{ key: string; prompt: string }>;
  scope: "in_scope" | "out_of_scope" | "undetermined";
  earned: number;
  possible: number;
}

export type AedtRunMetric = "selection_rate" | "scoring_rate";

export interface AedtAttestedDecision {
  readiness: AedtReadiness;
  /** The rate a run computes; null when out of scope or the cutoff answer is open. */
  metric: AedtRunMetric | null;
}

/** A stance row as the server returns it, from a run or a scope determination. */
export interface AedtStanceRow {
  id: number;
  version: number;
  pdf_sha256: string | null;
  pdf_file_id: number | null;
  score_at_generation: number | null;
  scope_at_generation: string;
  profile_version: number;
  question_set_version: number;
  generated_by: number | null;
  generated_at: string;
}

export interface AedtScopeDetermination extends AedtStanceRow {
  /** True only for the one that cites the currently attested profile. */
  isCurrent: boolean;
}

export interface AedtProfileView {
  project: { id: number; title: string };
  profile: { id: number; version: number; status: string } | null;
  attested: {
    id: number;
    version: number;
    attestedByUserId: number | null;
    attestedAt: string | null;
  } | null;
  answers: AedtProfileAnswer[];
  /** Readiness of the edited version, which may be a draft ahead of the attested one. */
  readiness: AedtReadiness;
  /**
   * What the attested profile decides, which runs and scope determinations
   * act on. Null when no version is attested.
   */
  attestedDecision: AedtAttestedDecision | null;
  scopeDeterminations: AedtScopeDetermination[];
}

export interface AedtGateFinding {
  code: string;
  severity: "stop" | "warn" | "note";
  message: string;
  detail?: Record<string, unknown>;
}

export interface AedtGroupResult {
  categoryType: string;
  categoryName: string;
  applicantCount: number;
  selectedCount: number;
  selectionRate: number;
  impactRatio: number | null;
  excluded: boolean;
  flagged: boolean;
}

export interface AedtCategoryTable {
  title: string;
  categoryKey: string;
  rows: AedtGroupResult[];
  highestGroup: string | null;
  highestRate: number | null;
}

export interface AedtAuditResult {
  metric: string;
  tables: AedtCategoryTable[];
  overallSelectionRate: number;
  overallMedian: number | null;
  totalApplicants: number;
  totalSelected: number;
  unknownCount: number;
  flagsCount: number;
  excludedCount: number;
  summary: string;
}

export interface AedtCategoryBasis {
  category: string;
  basis: string;
  expiryTrigger: string;
}

export interface AedtDerivedBasis {
  perCategory: AedtCategoryBasis[];
  confirmed: boolean;
  summary: string;
  confirmedBy?: number;
  confirmedAt?: string;
}

export interface AedtRunSummary {
  id: number;
  profile_id: number;
  profile_version: number;
  question_set_version: number;
  job_description_key: string | null;
  metric: string;
  readiness_score: number | null;
  readiness_blocked_reason: string | null;
  expiry_date: string | null;
  row_count: number | null;
  dataset_sha256: string | null;
  has_result: boolean;
  created_by: number | null;
  created_at: string;
}

export interface AedtRun {
  id: number;
  project_id: number;
  profile_id: number;
  profile_version: number;
  question_set_version: number;
  job_description_key?: string | null;
  metric: string;
  threshold?: string | null;
  threshold_source?: string | null;
  small_sample_exclusion?: string | null;
  data_basis_json?: AedtDerivedBasis | null;
  expiry_date?: string | null;
  expiry_trigger?: string | null;
  readiness_score?: number | null;
  readiness_blocked_reason?: string | null;
  result_json?: AedtAuditResult | null;
  gate_findings_json?: AedtGateFinding[] | null;
  row_count?: number | null;
  dataset_sha256?: string | null;
  created_by?: number | null;
  created_at: string;
}

export interface AedtRunView {
  run: AedtRun;
  stances: AedtStanceRow[];
  mayExportPdf: boolean;
}

export interface AedtCreateRunResult {
  runId: number;
  readiness: AedtReadiness;
  outcome: {
    gates: { findings: AedtGateFinding[]; mayComputeRatios: boolean; mayExportPdf: boolean };
    result: AedtAuditResult | null;
  };
}

export interface AedtStanceCreated {
  stanceId: number;
  version: number;
  sha256: string;
}

/** One run on the trend: the lowest impact ratio of any non-excluded group. */
export interface AedtTrendPoint {
  runId: number;
  date: string;
  /** The table holding the lowest ratio; null when the run produced no ratio. */
  category: string | null;
  lowestRatio: number | null;
  /** Whether any non-excluded group in the run was flagged. */
  flagged: boolean;
  /** True when the run's data checks did not clear it for export. */
  caveat: boolean;
}

/** Runs measured under one configuration, which may be compared with each other. */
export interface AedtTrendSegment {
  profileVersion: number;
  questionSetVersion: number;
  jobDescriptionKey: string | null;
  metric: string;
  points: AedtTrendPoint[];
}

/** Where the configuration changed, and in plain words what changed. */
export interface AedtTrendBreak {
  afterRunId: number;
  reasons: string[];
}

export interface AedtTrendSeries {
  segments: AedtTrendSegment[];
  breaks: AedtTrendBreak[];
}

export interface AedtStanceDownload {
  blob: Blob;
  /** The raw Content-Disposition header, when the browser exposes it. */
  disposition: unknown;
}

// ==================== SERVICE ====================

const BASE = "/bias-audit";

/**
 * Request options for this module. The caller shows its own message, so the
 * global toast would be a duplicate (`suppressGlobalErrorToast`, read by
 * customAxios).
 */
function options(extra: AxiosRequestConfig = {}): AxiosRequestConfig {
  const config: AxiosRequestConfig & { suppressGlobalErrorToast: boolean } = {
    ...extra,
    suppressGlobalErrorToast: true,
  };
  return config;
}

/** Successful answers arrive as `{ message, data }`. */
function unwrap<T>(body: unknown): T {
  return (body as { data: T }).data;
}

class AedtBiasAuditService {
  /** The whole question set, each with its `appliesWhen`; the page filters on its answers. */
  async getQuestions(projectId: number, frameworkId: number): Promise<AedtQuestion[]> {
    const res = await CustomAxios.get(
      `${BASE}/questions/${frameworkId}`,
      options({ params: { projectId } }),
    );
    return unwrap<{ questions: AedtQuestion[] }>(res.data).questions;
  }

  async getProfile(projectId: number, frameworkId: number): Promise<AedtProfileView> {
    const res = await CustomAxios.get(`${BASE}/profiles/${projectId}/${frameworkId}`, options());
    return unwrap<AedtProfileView>(res.data);
  }

  async saveAnswers(
    projectId: number,
    frameworkId: number,
    answers: AedtAnswerInput[],
  ): Promise<{ profileId: number; version: number }> {
    const res = await CustomAxios.put(
      `${BASE}/profiles/${projectId}/${frameworkId}`,
      { answers },
      options(),
    );
    return unwrap(res.data);
  }

  async attestProfile(
    projectId: number,
    frameworkId: number,
  ): Promise<{ profileId: number; version: number }> {
    const res = await CustomAxios.post(
      `${BASE}/profiles/${projectId}/${frameworkId}/attest`,
      {},
      options(),
    );
    return unwrap(res.data);
  }

  async generateScopeDetermination(
    projectId: number,
    frameworkId: number,
  ): Promise<AedtStanceCreated> {
    const res = await CustomAxios.post(
      `${BASE}/profiles/${projectId}/${frameworkId}/stance`,
      {},
      options(),
    );
    return unwrap(res.data);
  }

  async createRun(args: {
    projectId: number;
    frameworkId: number;
    file: File;
    mapping: Record<string, string>;
    /** The job title tested; omitted when blank, which the server records as not given. */
    jobDescription: string;
  }): Promise<AedtCreateRunResult> {
    const form = new FormData();
    form.append("projectId", String(args.projectId));
    form.append("frameworkId", String(args.frameworkId));
    form.append("mapping", JSON.stringify(args.mapping));
    if (args.jobDescription.trim() !== "") form.append("jobDescription", args.jobDescription);
    form.append("file", args.file);
    // The instance defaults to JSON; this lets the browser set the boundary.
    const res = await CustomAxios.post(
      `${BASE}/runs`,
      form,
      options({ headers: { "Content-Type": "multipart/form-data" } }),
    );
    return unwrap(res.data);
  }

  async listRuns(projectId: number, frameworkId: number): Promise<AedtRunSummary[]> {
    const res = await CustomAxios.get(
      `${BASE}/runs`,
      options({ params: { projectId, frameworkId } }),
    );
    return unwrap<{ runs: AedtRunSummary[] }>(res.data).runs;
  }

  /** The ratio trend, built on the server; raw run results are not returned. */
  async getRunTrend(projectId: number, frameworkId: number): Promise<AedtTrendSeries> {
    const res = await CustomAxios.get(
      `${BASE}/runs/trend`,
      options({ params: { projectId, frameworkId } }),
    );
    const series = unwrap<AedtTrendSeries>(res.data);
    // Fail closed: only an explicit false clears a point of the caveat.
    return {
      ...series,
      segments: series.segments.map((segment) => ({
        ...segment,
        points: segment.points.map((p) => ({ ...p, caveat: p.caveat !== false })),
      })),
    };
  }

  async getRun(runId: number): Promise<AedtRunView> {
    const res = await CustomAxios.get(`${BASE}/runs/${runId}`, options());
    return unwrap<AedtRunView>(res.data);
  }

  async confirmDerivedBasis(
    runId: number,
  ): Promise<{ runId: number; derivedBasis: AedtDerivedBasis }> {
    const res = await CustomAxios.post(
      `${BASE}/runs/${runId}/derived-basis/confirm`,
      {},
      options(),
    );
    return unwrap(res.data);
  }

  async generateRunStance(runId: number): Promise<AedtStanceCreated> {
    const res = await CustomAxios.post(`${BASE}/runs/${runId}/stance`, {}, options());
    return unwrap(res.data);
  }

  async downloadStance(stanceId: number): Promise<AedtStanceDownload> {
    const res = await CustomAxios.get(
      `${BASE}/stances/${stanceId}/download`,
      options({ responseType: "blob" }),
    );
    return { blob: res.data as Blob, disposition: res.headers?.["content-disposition"] };
  }
}

export const aedtBiasAuditService = new AedtBiasAuditService();
