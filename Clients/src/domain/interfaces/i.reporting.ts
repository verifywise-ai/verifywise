// Types for the enterprise reporting stack (templates / scheduled / runs).
// Phase 1 introduces only what the async generate flow needs; later phases extend.

export type ReportRunStatus =
  | "running"
  | "success"
  | "failed"
  | "partial_success";

export interface ReportRun {
  id: number;
  organization_id: number;
  status: ReportRunStatus;
  triggered_by: string;
  file_id: number | null;
  output_filename: string | null;
  output_mime_type: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GenerateReportRequestBody {
  projectId: number | string;
  frameworkId: number | string;
  projectFrameworkId: number | string;
  reportType: string | string[];
  reportName?: string;
  format?: "pdf" | "docx";
  aiEnhanced?: boolean;
  llmKeyId?: number;
}

export interface GenerateReportResponse {
  runId: number;
}

// ---------------------------------------------------------------------------
// Section catalog (GET /api/reporting/sections)
// ---------------------------------------------------------------------------

export interface ReportSectionCatalogEntry {
  key: string;
  label: string;
  group: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type ReportScope = "project" | "organization";

/**
 * The seven AI blocks Phase 2 shipped on the backend. Mirrors
 * Servers/domain.layer/interfaces/i.reportTemplate.ts AiBlocksConfig.
 */
export interface AiBlocksConfig {
  sectionSummaries?: boolean;
  executiveSummary?: boolean;
  keyFindings?: boolean;
  recommendedActions?: boolean;
  riskAnalysis?: boolean;
  complianceGap?: boolean;
  vendorRisk?: boolean;
}

export interface TemplateSectionConfig {
  key: string;
  reportSectionKey: string;
  label: string;
  core: boolean;
  defaultEnabled: boolean;
  supportedScopes: ReportScope[];
}

export interface SectionsConfig {
  sections: TemplateSectionConfig[];
}

export interface ReportTemplateVersion {
  id: number;
  template_id: number;
  version: number;
  sections_config: SectionsConfig;
  ai_blocks_config: AiBlocksConfig;
  format_config: Record<string, unknown>;
  branding_config: Record<string, unknown>;
  schedule_defaults: Record<string, unknown>;
  delivery_defaults: Record<string, unknown>;
  created_at: string;
}

export interface ReportTemplate {
  id: number;
  organization_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  default_scope: ReportScope;
  supported_scopes: ReportScope[];
  recommended_frequency: string | null;
  is_system_template: boolean;
  is_active: boolean;
  created_at: string;
  latestVersion?: ReportTemplateVersion | null;
}

/** Body for POST /templates and PATCH /templates/:id. */
export interface ReportTemplateWriteBody {
  name?: string;
  description?: string | null;
  category?: string;
  default_scope?: ReportScope;
  supported_scopes?: ReportScope[];
  recommended_frequency?: string | null;
  is_active?: boolean;
  sections_config?: SectionsConfig;
  ai_blocks_config?: AiBlocksConfig;
}

// ---------------------------------------------------------------------------
// Per-run AI analyses (GET /api/reporting/runs/:id/analyses)
//
// These payload shapes are hand-mirrored from the backend zod schemas in
// Servers/services/reporting/analyzers/schemas.ts, pinned by
// Servers/services/reporting/analyzers/__tests__/payloadShape.test.ts.
// If that test fails, this block is what needs updating.
// ---------------------------------------------------------------------------

/**
 * Section keys that can appear in a report_run_analyses row.
 *
 * `sectionSummaries` is NOT one of the six registry analyzers — it is written
 * separately by runAnalyzers and persisted like the rest, so the endpoint
 * returns it and any consumer must handle it. Leaving it out of this union
 * is how a panel ends up silently ignoring a row that is really there.
 */
export type AnalysisSectionKey =
  | "executiveSummary"
  | "keyFindings"
  | "recommendedActions"
  | "riskAnalysis"
  | "complianceGap"
  | "vendorRisk"
  | "sectionSummaries";

/** The `severity` / `priority` enum shared by the analyzer schemas. */
export type AnalysisSeverity = "low" | "medium" | "high" | "critical";

export interface SectionSummariesPayload {
  summaries: Record<string, string>;
}

export interface ExecutiveSummaryPayload {
  summary: string;
  abstain_reason: string | null;
}

export interface KeyFindingsPayload {
  findings: Array<{ text: string; section: string; severity: AnalysisSeverity }>;
  abstain_reason: string | null;
}

export interface RecommendedActionsPayload {
  actions: Array<{
    action: string;
    suggestedOwner: string | null;
    priority: AnalysisSeverity;
    rationale: string;
  }>;
  abstain_reason: string | null;
}

export interface RiskAnalysisPayload {
  narrative: string;
  // `level` is a free string, not the severity enum: the analyzer copies the
  // risk level verbatim from the input, whose vocabulary is wider.
  top_risks: Array<{ name: string; level: string; why: string }>;
  abstain_reason: string | null;
}

export interface ComplianceGapPayload {
  narrative: string;
  gaps: Array<{ control: string; gap: string; priority: AnalysisSeverity }>;
  scores_caveat: string | null;
  abstain_reason: string | null;
}

export interface VendorRiskPayload {
  narrative: string;
  concerns: Array<{
    vendor: string;
    concern: string;
    severity: AnalysisSeverity;
  }>;
  abstain_reason: string | null;
}

export type AnalysisPayload =
  | ExecutiveSummaryPayload
  | KeyFindingsPayload
  | RecommendedActionsPayload
  | RiskAnalysisPayload
  | ComplianceGapPayload
  | VendorRiskPayload
  | SectionSummariesPayload
  // An abstained or failed analyzer persists a null payload. Consumers must
  // narrow before reading any field.
  | null;

export interface ReportRunAnalysis {
  id: number;
  report_run_id: number;
  section_key: string;
  payload: AnalysisPayload;
  analysis_model: string | null;
  analysis_version: number;
  analyzed_at: string;
  analyzed_by: number | null;
  audit_metadata: Record<string, unknown> | null;
}

/** Paginated envelope returned by GET /api/reporting/runs. */
export interface ReportRunPage {
  rows: ReportRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScheduledReportUpdateBody {
  name?: string;
  scope?: ReportScope;
  projectId?: number | null;
  frameworkId?: number | null;
  projectFrameworkId?: number | null;
  sectionsConfig?: SectionsConfig;
  aiBlocksConfig?: AiBlocksConfig;
  format?: "pdf" | "docx";
  scheduleConfig?: Record<string, unknown>;
  deliveryConfig?: Record<string, unknown>;
}
