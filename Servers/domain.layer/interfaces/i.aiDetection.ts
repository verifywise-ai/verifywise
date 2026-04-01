/**
 * @fileoverview AI Detection Interface Definitions
 *
 * Type definitions for AI Detection feature including scans, findings,
 * and related DTOs for API requests/responses.
 *
 * @module domain.layer/interfaces/i.aiDetection
 */

// ============================================================================
// Scan Types
// ============================================================================

/**
 * Valid status values for a scan
 */
export type ScanStatus =
  | "pending"
  | "cloning"
  | "scanning"
  | "completed"
  | "failed"
  | "cancelled";

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
  risk_score_grade?: string | null;
  risk_score_details?: Record<string, unknown> | null;
  risk_score_calculated_at?: Date | null;
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
}

// ============================================================================
// Finding Types
// ============================================================================

/**
 * All valid finding types as a const array (single source of truth).
 * Use FINDING_TYPES for runtime validation; use FindingType for static typing.
 */
export const FINDING_TYPES = [
  "library", "dependency", "api_call", "secret", "model_ref", "rag_component", "agent",
  "prompt_injection", "pii_exposure", "excessive_agency", "jailbreak_risk",
  "training_data_poisoning", "model_dos", "supply_chain", "insecure_plugin", "overreliance", "model_theft",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

/**
 * Vulnerability-specific finding types (subset of FindingType).
 */
export const VULNERABILITY_FINDING_TYPES = [
  "prompt_injection", "pii_exposure", "excessive_agency", "jailbreak_risk",
  "training_data_poisoning", "model_dos", "supply_chain", "insecure_plugin", "overreliance", "model_theft",
] as const;

export type VulnerabilityFindingType = (typeof VULNERABILITY_FINDING_TYPES)[number];

/**
 * Valid governance status values for findings
 */
export type GovernanceStatus = "reviewed" | "approved" | "flagged";

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
 * Summary of scan findings
 */
export interface IScanSummary {
  total: number;
  by_confidence: IFindingsByConfidence;
  by_provider: Record<string, number>;
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
    risk_score_grade?: string | null;
    risk_score_details?: Record<string, unknown> | null;
    risk_score_calculated_at?: string | null;
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
  risk_score_grade?: string | null;
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
  /** Tenant hash (string) for cache keys */
  tenantId: string;
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
