export type ReportScope = "project" | "organization";
export type ReportFrequency = "daily" | "weekly" | "monthly";
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
  executiveSummary: boolean;
  keyFindings: boolean;
  recommendedActions: boolean;
}

export interface ScheduleConfig {
  frequency: ReportFrequency;
  hour: number;
  minute: number;
  timezone: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
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
