/**
 * @fileoverview AI Detection Interface Definitions
 *
 * Type definitions for AI Detection feature including scans, findings,
 * and related DTOs for API requests/responses.
 *
 * @module domain.layer/interfaces/i.aiDetection
 */

import type { DimensionKey, RiskGrade } from "../../config/riskScoringConfig";

export type { DimensionKey, RiskGrade };

// ============================================================================
// Scan Types
// ============================================================================

/**
 * Valid status values for a scan
 */
export type ScanStatus = "pending" | "cloning" | "scanning" | "completed" | "failed" | "cancelled";

/**
 * Scan mode: full scans all files, incremental scans only changed files
 */
export type ScanMode = "full" | "incremental";

/**
 * Finding status for incremental scans
 * - active: detected in this scan's changed files
 * - fixed: was in baseline but all its files were deleted
 * - carried_forward: unchanged from baseline (files not in diff)
 */
export type FindingStatus = "active" | "fixed" | "carried_forward";

/**
 * Whether LLM vulnerability checks ran for a scan.
 * - ran: every file was checked and every LLM call finished (findings may be zero)
 * - off: vulnerability detection is off or not chosen, no LLM key is set for
 *   AI Detection, or every vulnerability type is disabled
 * - failed: checks were on but didn't finish: the key couldn't be resolved,
 *   any LLM call failed, or the scan was cancelled. Findings from the types
 *   that finished are kept.
 * - incremental: an incremental scan with checks on. Changed files weren't
 *   checked; vulnerability findings for unchanged files carry over from the
 *   last full scan.
 * NULL on scans created before this was recorded.
 */
export const VULNERABILITY_CHECK_STATUSES = ["ran", "off", "failed", "incremental"] as const;
export type VulnerabilityCheckStatus = (typeof VULNERABILITY_CHECK_STATUSES)[number];

/**
 * State of the optional LLM analysis on a governance score.
 * - pending: rule-based score stored, LLM analysis running in the background
 * - done: LLM analysis applied
 * - failed: LLM analysis did not finish; the rule-based score stands
 * - off: LLM analysis not configured, or nothing to analyse
 */
export type LlmAnalysisStatus = "pending" | "done" | "failed" | "off";

/**
 * Represents a scan record in the database
 */
export interface IScan {
  id?: number;
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  default_branch?: string;
  status: ScanStatus;
  findings_count?: number;
  files_scanned?: number;
  total_files?: number;
  started_at?: Date;
  completed_at?: Date;
  duration_ms?: number;
  error_message?: string;
  triggered_by: number;
  cache_path?: string;
  repository_id?: number | null;
  triggered_by_type?: string;
  risk_score?: number | null;
  risk_score_grade?: RiskGrade | null;
  risk_score_details?: IRiskScoreDetails | null;
  risk_score_calculated_at?: Date | null;
  vulnerability_check_status?: VulnerabilityCheckStatus | null;
  /** When the scan's end was announced (services/aiDetection/scanNotifications.ts); NULL until then. */
  notified_at?: Date | null;
  // Incremental scan fields
  scan_mode?: ScanMode;
  base_commit_sha?: string | null;
  head_commit_sha?: string | null;
  baseline_scan_id?: number | null;
  changed_files_count?: number | null;
  // Webhook CI/CD fields
  trigger_type?: string;
  pr_number?: number | null;
  commit_sha?: string | null;
  branch?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Input for creating a new scan
 */
export interface ICreateScanInput {
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  status?: ScanStatus;
  triggered_by: number;
  repository_id?: number | null;
  triggered_by_type?: string;
  // Incremental scan fields
  scan_mode?: ScanMode;
  base_commit_sha?: string | null;
  head_commit_sha?: string | null;
  baseline_scan_id?: number | null;
  // Webhook CI/CD fields
  trigger_type?: string;
  pr_number?: number | null;
  commit_sha?: string | null;
  branch?: string | null;
}

/**
 * Input for updating scan progress
 */
export interface IUpdateScanProgressInput {
  status?: ScanStatus;
  files_scanned?: number;
  total_files?: number;
  findings_count?: number;
  started_at?: Date;
  completed_at?: Date;
  duration_ms?: number;
  error_message?: string;
  cache_path?: string;
  vulnerability_check_status?: VulnerabilityCheckStatus;
}

// ============================================================================
// Finding Types
// ============================================================================

/**
 * All valid finding types as a const array (single source of truth).
 * Use FINDING_TYPES for runtime validation; use FindingType for static typing.
 */
export const FINDING_TYPES = [
  "library",
  "dependency",
  "api_call",
  "secret",
  "model_ref",
  "rag_component",
  "agent",
  "prompt_injection",
  "pii_exposure",
  "excessive_agency",
  "jailbreak_risk",
  "training_data_poisoning",
  "model_dos",
  "supply_chain",
  "insecure_plugin",
  "overreliance",
  "model_theft",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

/**
 * Vulnerability-specific finding types (subset of FindingType).
 */
export const VULNERABILITY_FINDING_TYPES = [
  "prompt_injection",
  "pii_exposure",
  "excessive_agency",
  "jailbreak_risk",
  "training_data_poisoning",
  "model_dos",
  "supply_chain",
  "insecure_plugin",
  "overreliance",
  "model_theft",
] as const;

export type VulnerabilityFindingType = (typeof VULNERABILITY_FINDING_TYPES)[number];

/**
 * Valid governance status values for findings
 */
export type GovernanceStatus = "reviewed" | "approved" | "flagged" | "suppressed" | "accepted_risk";

/**
 * Valid confidence levels
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Valid risk levels for findings
 * Based on data leakage potential and security impact
 */
export type RiskLevel = "high" | "medium" | "low";

/**
 * Severity of a vulnerability or model security finding
 */
export type FindingSeverity = "critical" | "high" | "medium" | "low";

/**
 * License risk levels for findings
 */
export type LicenseRiskLevel = "high" | "medium" | "low" | "unknown";

/**
 * Source of license information
 */
export type LicenseSource = "package" | "huggingface" | "pypi" | "npm" | "manual";

/**
 * Represents a file path where a finding was detected
 */
export interface IFilePath {
  path: string;
  line_number: number | null;
  matched_text: string;
}

/**
 * Represents a finding record in the database
 */
export interface IFinding {
  id?: number;
  scan_id: number;
  finding_type: FindingType;
  category: string;
  name: string;
  provider?: string;
  confidence: ConfidenceLevel;
  risk_level?: RiskLevel;
  description?: string;
  documentation_url?: string;
  file_count?: number;
  file_paths?: IFilePath[];
  governance_status?: GovernanceStatus | null;
  governance_updated_at?: Date;
  governance_updated_by?: number;
  /** Display name of governance_updated_by (joined from users on read). */
  governance_updated_by_name?: string | null;
  // Suppression flags
  suppressed?: boolean;
  suppression_rule_id?: number | null;
  // License information
  license_id?: string | null;
  license_name?: string | null;
  license_risk?: LicenseRiskLevel | null;
  license_source?: LicenseSource | null;
  // Vulnerability detection fields
  mitigation?: string | null;
  data_flow_summary?: string | null;
  vulnerability_details?: Record<string, unknown> | null;
  // Severity (vulnerability and model security findings)
  severity?: FindingSeverity | null;
  // Incremental scan fields
  finding_status?: FindingStatus;
  created_at?: Date;
}

/**
 * Input for creating a new finding
 */
export interface ICreateFindingInput {
  scan_id: number;
  finding_type: FindingType;
  category: string;
  name: string;
  provider?: string;
  confidence: ConfidenceLevel;
  risk_level?: RiskLevel;
  description?: string;
  documentation_url?: string;
  file_count?: number;
  file_paths?: IFilePath[];
  // License information
  license_id?: string | null;
  license_name?: string | null;
  license_risk?: LicenseRiskLevel | null;
  license_source?: LicenseSource | null;
  // Vulnerability detection fields
  mitigation?: string | null;
  data_flow_summary?: string | null;
  vulnerability_details?: Record<string, unknown> | null;
  // Incremental scan fields
  finding_status?: FindingStatus;
  // Severity (vulnerability findings); used by the CI critical-findings gate
  severity?: FindingSeverity | null;
  // Suppression flags (set by the matcher at scan completion)
  suppressed?: boolean;
  suppression_rule_id?: number | null;
}

// ============================================================================
// API DTOs
// ============================================================================

/**
 * Request body for starting a scan
 */
export interface IStartScanRequest {
  repository_url: string;
  scan_mode?: ScanMode;
  base_commit_sha?: string;
  head_commit_sha?: string;
}

/**
 * Response for scan status polling
 */
export interface IScanStatusResponse {
  id: number;
  status: ScanStatus;
  progress: number;
  current_file?: string;
  files_scanned: number;
  total_files?: number;
  findings_count: number;
  error_message?: string;
}

/**
 * Summary of scan findings by confidence
 */
export interface IFindingsByConfidence {
  high: number;
  medium: number;
  low: number;
}

/**
 * Summary of scan findings by detection type (inventory finding types)
 */
export interface IFindingsByType {
  library: number;
  dependency: number;
  api_call: number;
  secret: number;
  model_ref: number;
  rag_component: number;
  agent: number;
}

/**
 * Summary of scan findings
 */
export interface IScanSummary {
  total: number;
  by_confidence: IFindingsByConfidence;
  by_provider: Record<string, number>;
  by_finding_type: IFindingsByType;
}

/**
 * Per-dimension contribution inside a risk score payload
 */
export interface IDimensionScore {
  score: number;
  penalty_count: number;
  top_contributors: string[];
}

/**
 * LLM-suggested risk entry nested under risk_score_details
 */
export interface ISuggestedRisk {
  risk_name: string;
  risk_description: string;
  risk_category: string[];
  ai_lifecycle_phase: string;
  likelihood: number;
  severity: number;
  impact: string;
  mitigation_plan: string;
  dimension: DimensionKey;
  finding_refs: string[];
}

/**
 * Structured risk score details returned on scan detail responses
 */
export interface IRiskScoreDetails {
  dimensions: Record<DimensionKey, IDimensionScore>;
  llm_enhanced: boolean;
  llm_narrative: string | null;
  llm_recommendations: string[] | null;
  llm_adjustments: Record<DimensionKey, number> | null;
  llm_suggested_risks: ISuggestedRisk[] | null;
  /** Absent on scores stored before LLM analysis moved to the background */
  llm_status?: LlmAnalysisStatus;
  /** Ties a background LLM write to the rule-based run that started it */
  llm_run_id?: string;
  /**
   * The rule-based grade before any LLM adjustment. Kept on the LLM write so
   * scans can be compared on the same basis (scan notifications' grade-drop
   * check). Absent on scores stored before it was recorded.
   */
  rule_grade?: RiskGrade;
}

/**
 * User info for triggered_by field
 */
export interface ITriggeredByUser {
  id: number;
  name: string;
  surname?: string;
}

/**
 * Full scan response with summary
 */
export interface IScanResponse {
  scan: {
    id: number;
    repository_url: string;
    repository_owner: string;
    repository_name: string;
    status: ScanStatus;
    findings_count: number;
    files_scanned: number;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    error_message?: string;
    triggered_by: ITriggeredByUser;
    risk_score?: number | null;
    risk_score_grade?: RiskGrade | null;
    risk_score_details?: IRiskScoreDetails | null;
    risk_score_calculated_at?: string | null;
    vulnerability_check_status?: VulnerabilityCheckStatus | null;
    scan_mode?: ScanMode;
    base_commit_sha?: string | null;
    head_commit_sha?: string | null;
    baseline_scan_id?: number | null;
    changed_files_count?: number | null;
    created_at: string;
  };
  summary: IScanSummary;
}

/**
 * Finding response for API
 */
export interface IFindingResponse {
  id: number;
  finding_type: FindingType;
  category: string;
  name: string;
  provider: string;
  confidence: ConfidenceLevel;
  risk_level: RiskLevel;
  description?: string;
  documentation_url?: string;
  file_count: number;
  file_paths: IFilePath[];
  governance_status?: GovernanceStatus | null;
  governance_updated_at?: string;
  governance_updated_by?: number;
  /** API v1 only: display name of governance_updated_by. */
  governance_updated_by_name?: string | null;
  // License information
  license_id?: string | null;
  license_name?: string | null;
  license_risk?: LicenseRiskLevel | null;
  license_source?: LicenseSource | null;
  // Vulnerability detection fields
  mitigation?: string | null;
  data_flow_summary?: string | null;
  vulnerability_details?: Record<string, unknown> | null;
  // Incremental scan fields
  finding_status?: FindingStatus;
  // Suppression flags
  suppressed?: boolean;
  suppression_rule_id?: number | null;
}

/**
 * Request for updating finding governance status
 */
export interface IUpdateGovernanceStatusRequest {
  governance_status: GovernanceStatus | null;
}

/**
 * Response for governance status update
 */
export interface IUpdateGovernanceStatusResponse {
  id: number;
  governance_status: GovernanceStatus | null;
  governance_updated_at: string;
  governance_updated_by: number;
}

/**
 * Where a governance status change applies: "repository" when it was set on
 * the repository's latest completed scan (stored for later scans), "scan"
 * when it changed only this scan's finding.
 */
export type GovernanceDecisionScope = "repository" | "scan";

/**
 * Response for a governance status update on API v1: who set the status
 * (null once cleared) and where the change applies.
 */
export interface IFindingGovernanceUpdate {
  id: number;
  governance_status: GovernanceStatus | null;
  governance_updated_at: string | null;
  governance_updated_by: number | null;
  governance_updated_by_name: string | null;
  decision_scope: GovernanceDecisionScope;
}

/**
 * Why a suggested risk was ignored.
 */
export type SuggestedRiskIgnoreReason = "already_added" | "not_real_risk";

/**
 * What a user did with one LLM-suggested risk on a scan.
 */
export interface ISuggestedRiskAction {
  id: number;
  scan_id: number;
  suggestion_key: string;
  risk_name: string;
  action: "added" | "ignored";
  risk_id: number | null;
  ignore_reason: SuggestedRiskIgnoreReason | null;
  acted_by: number | null;
  acted_by_name: string | null;
  acted_at: string;
  /** True when the risk created from this suggestion was deleted since. */
  risk_deleted: boolean;
}

/**
 * Paginated findings response
 */
export interface IFindingsResponse {
  findings: IFindingResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  /**
   * API v1 only: whether this is the repository's latest completed scan.
   * Status changes on any other scan apply to that scan only.
   */
  is_latest_scan?: boolean;
}

/**
 * Scan list item for history
 */
export interface IScanListItem {
  id: number;
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  status: ScanStatus;
  findings_count: number;
  files_scanned: number;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  triggered_by: ITriggeredByUser;
  risk_score?: number | null;
  risk_score_grade?: RiskGrade | null;
  vulnerability_check_status?: VulnerabilityCheckStatus | null;
  scan_mode?: ScanMode;
  baseline_scan_id?: number | null;
  changed_files_count?: number | null;
  created_at: string;
}

/**
 * Paginated scans response
 */
export interface IScansResponse {
  scans: IScanListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/**
 * Cancel scan response
 */
export interface ICancelScanResponse {
  id: number;
  status: "cancelled";
  message: string;
}

/**
 * Delete scan response
 */
export interface IDeleteScanResponse {
  message: string;
}

/**
 * Clear cache response
 */
export interface IClearCacheResponse {
  message: string;
  cleared_size_mb: number;
}

// ============================================================================
// Progress Tracking Types
// ============================================================================

/**
 * In-memory progress state for real-time tracking
 */
export interface IProgressState {
  scanId: number;
  status: ScanStatus;
  progress: number;
  currentFile?: string;
  filesScanned: number;
  totalFiles?: number;
  findingsCount: number;
  lastUpdated: Date;
}

/**
 * Parsed GitHub repository info
 */
export interface IParsedGitHubUrl {
  owner: string;
  repo: string;
}

// ============================================================================
// Service Types
// ============================================================================

/**
 * Service context for multi-tenancy
 */
export interface IServiceContext {
  userId: number;
  role: string;
  /** Organization ID (number) for organization_id column queries */
  organizationId: number;
}

/**
 * GitHub rate limit info
 */
export interface IRateLimitInfo {
  remaining: number;
  reset: Date;
}

/**
 * Repository validation result
 */
export interface IRepoValidationResult {
  valid: boolean;
  error?: string;
  rateLimit?: IRateLimitInfo;
}

// ============================================================================
// GitHub Token Types
// ============================================================================

/**
 * Represents a GitHub token record in the database
 */
export interface IGitHubToken {
  id?: number;
  encrypted_token: string;
  token_name?: string;
  created_by: number;
  created_at?: Date;
  updated_at?: Date;
  last_used_at?: Date;
}

/**
 * Response for GitHub token status check
 */
export interface IGitHubTokenStatus {
  configured: boolean;
  token_name?: string;
  last_used_at?: string;
  created_at?: string;
}

/**
 * Request for saving a GitHub token
 */
export interface ISaveGitHubTokenRequest {
  token: string;
  token_name?: string;
}

/**
 * Response for GitHub token test
 */
export interface IGitHubTokenTestResponse {
  valid: boolean;
  scopes?: string[];
  rate_limit?: {
    limit: number;
    remaining: number;
    reset: string;
  };
  error?: string;
}

/**
 * Match type for an AI detection suppression rule.
 * - exact: literal equality on the chosen field
 * - pattern: JS regex tested against the chosen field
 */
export type SuppressionMatchType = "exact" | "pattern";

/**
 * Finding fields a suppression rule can target.
 */
export type SuppressionField = "name" | "finding_type" | "category" | "provider";

/**
 * Org-scoped suppression rule. Matching findings are flagged with
 * `suppressed=true` and `suppression_rule_id` at scan completion (forward-only).
 */
export interface ISuppression {
  id?: number;
  organization_id: number;
  match_type: SuppressionMatchType;
  field: SuppressionField;
  value: string;
  reason?: string | null;
  expires_at?: Date | null;
  created_by?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Input for creating a new suppression rule.
 */
export interface ICreateSuppressionInput {
  match_type: SuppressionMatchType;
  field: SuppressionField;
  value: string;
  reason?: string | null;
  expires_at?: Date | string | null;
}
