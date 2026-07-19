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
