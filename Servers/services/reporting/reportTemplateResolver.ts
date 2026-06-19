import type { ReportGenerationRequest } from "../../domain.layer/interfaces/i.reportGeneration";

// scheduled_reports row -> existing engine request. De-dupes reportSectionKey.
export function resolveReportRequest(sched: any, llmKeyId?: number): ReportGenerationRequest {
  const sections = (sched.sections_config?.sections ?? [])
    .filter((s: any) => s.defaultEnabled !== false);
  const reportType = Array.from(new Set(sections.map((s: any) => s.reportSectionKey)));
  const ai = sched.ai_blocks_config ?? {};
  const aiEnhanced = !!(ai.executiveSummary || ai.keyFindings || ai.recommendedActions);
  return {
    projectId: sched.project_id ?? 0,
    frameworkId: sched.framework_id ?? 0,
    projectFrameworkId: sched.project_framework_id ?? 0,
    reportType: reportType.length ? reportType : "all",
    reportName: sched.name,
    format: sched.format,
    aiEnhanced,
    llmKeyId,
  };
}
