export type ReportScope = "project" | "organization";
export type ReportFrequency = "daily" | "weekly" | "monthly" | "quarterly";
export type RunStatus = "queued" | "running" | "success" | "failed" | "partial_success";

export interface TemplateSectionConfig {
  key: string;
  reportSectionKey: string; // maps to VALID_SECTION_KEYS
  label: string;
  core: boolean;
  defaultEnabled: boolean;
  supportedScopes: ReportScope[];
}

export interface AiBlocksConfig {
  /** Per-section AI prose. Ported from aiSummarizer; feeds the 24 sectionSummaries render blocks. */
  sectionSummaries?: boolean;
  executiveSummary?: boolean;
  keyFindings?: boolean;
  recommendedActions?: boolean;
  riskAnalysis?: boolean;
  complianceGap?: boolean;
  vendorRisk?: boolean;
}

/** A template version's default target frameworks. Empty means all in scope. */
export interface FrameworkConfig {
  /** Namespaced ids — see services/reporting/frameworkSelection.ts. */
  frameworkIds?: string[];
}

export type ReportParameterFieldType = "text" | "textarea" | "date" | "select" | "boolean";

export interface ReportParameterField {
  key: string;
  label: string;
  type: ReportParameterFieldType;
  required: boolean;
  maxLength?: number;
  options?: { value: string; label: string }[];
}

/** A template version's parameter declaration, for report kinds that take inputs. */
export interface ReportParametersConfig {
  kind?: string;
  fields?: ReportParameterField[];
}

/** Parameter values a run or schedule carries, keyed by ReportParameterField.key. */
export type ReportParameters = Record<string, string | boolean>;

export interface ScheduleConfig {
  frequency: ReportFrequency;
  hour: number;
  minute: number;
  timezone: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  /** Quarterly schedules: the month (1-12) the first quarter run falls in. */
  anchorMonth?: number;
}

export interface DeliveryConfig {
  saveToStorage: boolean;
  sendEmailLink: boolean;
  attachFile: boolean;
  recipients: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  sensitivity?: string;
}

export interface ScheduledReportRecord {
  id: number;
  organization_id: number;
  template_id: number;
  template_version_id: number;
  name: string;
  scope: ReportScope;
  project_id: number | null;
  framework_id: number | null;
  /** Namespaced framework selection. NULL or [] means every framework in scope. */
  framework_ids: string[] | null;
  /** Values for the template version's parameter fields. {} when it declares none. */
  report_parameters: ReportParameters;
  project_framework_id: number | null;
  sections_config: { sections: TemplateSectionConfig[] };
  ai_blocks_config: AiBlocksConfig;
  format: "pdf" | "docx";
  schedule_config: ScheduleConfig;
  delivery_config: DeliveryConfig;
  is_active: boolean;
  owner_id: number | null;
  next_run_at: string | null;
  last_run_at: string | null;
}
