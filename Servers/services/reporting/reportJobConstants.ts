// Shared BullMQ job name for on-demand (manual) report generation.
// Duplicating this string across enqueue + dispatch risks a silent
// "No handler found for action type" at runtime; import it in both places.
export const MANUAL_REPORT_JOB = "generate_report_manual";

export interface ManualReportJobData {
  runId: number;
  request: {
    projectId: number;
    frameworkId: number;
    projectFrameworkId: number;
    reportType: string | string[];
    reportName?: string;
    format: "pdf" | "docx";
    branding?: { organizationName: string };
    aiEnhanced?: boolean;
    llmKeyId?: number;
  };
  userId: number;
  organizationId: number;
}
