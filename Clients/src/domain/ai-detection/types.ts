/**
 * @fileoverview AI Detection Type Definitions
 *
 * Frontend types for AI Detection feature.
 *
 * @module domain/ai-detection/types
 */

import type { RiskGrade, RiskScoreDetails } from "./riskScoringTypes";

// ============================================================================
// Scan Types
// ============================================================================

export type ScanStatus =
  | "pending"
  | "cloning"
  | "scanning"
  | "completed"
  | "failed"
  | "cancelled";

export type ConfidenceLevel = "high" | "medium" | "low";

export type RiskLevel = "high" | "medium" | "low";

export type LicenseRiskLevel = "high" | "medium" | "low" | "unknown";

export type LicenseSource = "package" | "huggingface" | "pypi" | "npm" | "manual";

export type GovernanceStatus = "reviewed" | "approved" | "flagged";

export type ScanMode = "full" | "incremental";

export type FindingStatus = "active" | "fixed" | "carried_forward";

export interface TriggeredByUser {
  id: number;
  name: string;
  surname?: string;
}

export interface Scan {
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
  triggered_by: TriggeredByUser;
  repository_id?: number | null;
  triggered_by_type?: string;
  risk_score?: number | null;
  risk_score_grade?: RiskGrade | null;
  risk_score_details?: RiskScoreDetails | null;
  risk_score_calculated_at?: string | null;
  // Incremental scan fields
  scan_mode?: ScanMode;
  base_commit_sha?: string | null;
  head_commit_sha?: string | null;
  baseline_scan_id?: number | null;
  changed_files_count?: number | null;
  created_at: string;
}

// ============================================================================
// Finding Types
// ============================================================================

export interface FilePath {
  path: string;
  line_number: number | null;
  matched_text: string;
}

export type FindingType =
  | "library"
  | "dependency"
  | "api_call"
  | "secret"
  | "model_ref"
  | "rag_component"
  | "agent"
  | "prompt_injection"
  | "pii_exposure"
  | "excessive_agency"
  | "jailbreak_risk"
  | "training_data_poisoning"
  | "model_dos"
  | "supply_chain"
  | "insecure_plugin"
  | "overreliance"
  | "model_theft";

export interface Finding {
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
  file_paths: FilePath[];
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

// ============================================================================
// Vulnerability Finding Types
// ============================================================================

export type VulnerabilityFindingType =
  | "prompt_injection"
  | "pii_exposure"
  | "excessive_agency"
  | "jailbreak_risk"
  | "training_data_poisoning"
  | "model_dos"
  | "supply_chain"
  | "insecure_plugin"
  | "overreliance"
  | "model_theft";

export const VULNERABILITY_FINDING_TYPES: VulnerabilityFindingType[] = [
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
];

export interface VulnerabilityFindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface VulnerabilitySummary {
  total: number;
  by_severity: VulnerabilityFindingsBySeverity;
  by_type: Record<VulnerabilityFindingType, number>;
}

// ============================================================================
// Security Finding Types (Model Security Scanning)
// ============================================================================

export type SecuritySeverity = "critical" | "high" | "medium" | "low";

export interface SecurityFinding {
  id: number;
  finding_type: "model_security";
  category: string;
  name: string;
  provider: string;
  confidence: ConfidenceLevel;
  description?: string;
  documentation_url?: string;
  file_count: number;
  file_paths: FilePath[];
  // Security-specific fields
  severity: SecuritySeverity;
  cwe_id: string;
  cwe_name: string;
  owasp_ml_id: string;
  owasp_ml_name: string;
  threat_type: string;
  operator_name: string;
  module_name: string;
}

export interface SecurityFindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SecuritySummary {
  total: number;
  by_severity: SecurityFindingsBySeverity;
  by_threat_type: Record<string, number>;
  model_files_scanned: number;
}

export interface SecurityFindingsResponse {
  findings: SecurityFinding[];
  pagination: Pagination;
}

export interface GetSecurityFindingsParams {
  page?: number;
  limit?: number;
  severity?: SecuritySeverity;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ScanStatusResponse {
  id: number;
  status: ScanStatus;
  progress: number;
  current_file?: string;
  files_scanned: number;
  total_files?: number;
  findings_count: number;
  error_message?: string;
}

export interface FindingsByConfidence {
  high: number;
  medium: number;
  low: number;
}

export interface FindingsByType {
  library: number;
  dependency: number;
  api_call: number;
  secret: number;
  model_ref: number;
  rag_component: number;
  agent: number;
}

export interface ScanSummary {
  total: number;
  by_confidence: FindingsByConfidence;
  by_provider: Record<string, number>;
  by_finding_type?: FindingsByType;
}

export interface ScanResponse {
  scan: Scan;
  summary: ScanSummary;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface FindingsResponse {
  findings: Finding[];
  pagination: Pagination;
}

export interface ScansResponse {
  scans: Scan[];
  pagination: Pagination;
}

// ============================================================================
// API Request Types
// ============================================================================

export interface StartScanRequest {
  repository_url: string;
  scan_mode?: ScanMode;
  base_commit_sha?: string;
  head_commit_sha?: string;
}

export interface GetScansParams {
  page?: number;
  limit?: number;
  status?: ScanStatus;
}

export interface GetFindingsParams {
  page?: number;
  limit?: number;
  confidence?: ConfidenceLevel;
  finding_type?: FindingType;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface ScanState {
  isScanning: boolean;
  currentScan: Scan | null;
  progress: ScanStatusResponse | null;
  error: string | null;
}

export interface FindingsState {
  findings: Finding[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
}

export interface HistoryState {
  scans: Scan[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface GroupedFindings {
  [provider: string]: Finding[];
}

export interface ConfidenceStats {
  high: { count: number; percentage: number };
  medium: { count: number; percentage: number };
  low: { count: number; percentage: number };
}

// ============================================================================
// Governance Types
// ============================================================================

export interface GovernanceSummary {
  total: number;
  reviewed: number;
  approved: number;
  flagged: number;
  unreviewed: number;
}

export interface UpdateGovernanceStatusRequest {
  governance_status: GovernanceStatus | null;
}

export interface UpdateGovernanceStatusResponse {
  id: number;
  governance_status: GovernanceStatus | null;
  governance_updated_at: string;
  governance_updated_by: number;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface AIDetectionStats {
  total_scans: number;
  completed_scans: number;
  total_findings: number;
  unique_repositories: number;
  top_providers: { provider: string; count: number }[];
  findings_by_confidence: { high: number; medium: number; low: number };
  findings_by_type: FindingsByType;
  security_findings: number;
  recent_activity: { date: string; scans: number; findings: number }[];
}

// ============================================================================
// Dependency Graph Types
// ============================================================================

export type DependencyNodeType =
  | "library"
  | "model"
  | "api"
  | "secret"
  | "rag"
  | "agent"
  | "repository";

export type EdgeRelationship =
  | "uses"
  | "calls"
  | "requires"
  | "exposes"
  | "orchestrates"
  | "contains";

export interface DependencyGraphNode {
  id: string;
  findingId: number;
  type: DependencyNodeType;
  label: string;
  sublabel?: string;
  provider: string;
  confidence: ConfidenceLevel;
  riskLevel: RiskLevel;
  fileCount: number;
  filePaths: FilePath[];
  governanceStatus?: GovernanceStatus | null;
}

export interface DependencyGraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: EdgeRelationship;
  confidence: ConfidenceLevel;
}

export interface DependencyGraphRepository {
  owner: string;
  name: string;
  url: string;
}

export interface DependencyGraphSummary {
  totalNodes: number;
  byType: Record<string, number>;
  byRiskLevel: { high: number; medium: number; low: number };
  byProvider: Record<string, number>;
}

export interface DependencyGraphResponse {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  repository: DependencyGraphRepository;
  summary: DependencyGraphSummary;
}

// ============================================================================
// Compliance Mapping Types
// ============================================================================

export type ComplianceCategory =
  | "transparency"
  | "documentation"
  | "risk_management"
  | "data_governance"
  | "human_oversight"
  | "security"
  | "monitoring"
  | "accountability";

export type DocumentationRequirement = "required" | "recommended" | "conditional";

export interface ComplianceRequirement {
  id: string;
  articleRef: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  documentationRequired: DocumentationRequirement;
  checklistItems: string[];
}

export interface ComplianceFindingMapping {
  findingId: number;
  findingName: string;
  findingType: string;
  provider: string;
  requirements: ComplianceRequirement[];
  riskFactors: string[];
  documentationNeeds: string[];
}

export interface ComplianceChecklistItem {
  id: string;
  text: string;
  category: ComplianceCategory;
  articleRef: string;
  priority: "high" | "medium" | "low";
  relatedFindings: { id: number; name: string; type: string }[];
  completed: boolean;
}

export interface ComplianceSummary {
  totalRequirements: number;
  byCategory: Record<ComplianceCategory, number>;
  byPriority: { high: number; medium: number; low: number };
  coveragePercentage: number;
}

export interface ComplianceMappingResponse {
  scanId: number;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  mappings: ComplianceFindingMapping[];
  checklist: ComplianceChecklistItem[];
  summary: ComplianceSummary;
  generatedAt: string;
}
