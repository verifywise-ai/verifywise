import type { ReportGenerationRequest } from "../../domain.layer/interfaces/i.reportGeneration";

// scheduled_reports row -> existing engine request. De-dupes reportSectionKey.
export function resolveReportRequest(sched: any, llmKeyId?: number): ReportGenerationRequest {
  const sections: any[] = (sched.sections_config?.sections ?? []).filter(
    (s: any) => s.defaultEnabled !== false,
  );
  const reportType: string[] = Array.from(
    new Set(sections.map((s: any) => String(s.reportSectionKey))),
  );
  const ai = sched.ai_blocks_config ?? {};
  const aiBlocks = {
    sectionSummaries: !!ai.sectionSummaries,
    executiveSummary: !!ai.executiveSummary,
    keyFindings: !!ai.keyFindings,
    recommendedActions: !!ai.recommendedActions,
    riskAnalysis: !!ai.riskAnalysis,
    complianceGap: !!ai.complianceGap,
    vendorRisk: !!ai.vendorRisk,
  };
  // aiEnhanced stays as the coarse "did the user want any AI at all" flag that
  // the renderers and the filename marker already key off. aiBlocks carries the
  // per-analyzer detail that used to be lost here.
  const aiEnhanced = Object.values(aiBlocks).some(Boolean);
  return {
    projectId: sched.project_id ?? 0,
    frameworkId: sched.framework_id ?? 0,
    projectFrameworkId: sched.project_framework_id ?? 0,
    // A schedule states a scope and, optionally, which frameworks it targets.
    // generateReport turns scope + project into the set of projects_frameworks
    // pairings and frameworkIds narrows them. Falling back to the project id
    // keeps rows written before the scope column existed working.
    scope: sched.scope ?? (sched.project_id ? "project" : "organization"),
    // Namespaced framework selection. Undefined (not []) for a legacy row, so
    // resolveFrameworkTargets takes its unfiltered path unchanged.
    frameworkIds: sched.framework_ids ?? undefined,
    reportType: reportType.length ? reportType : "all",
    reportName: sched.name,
    format: sched.format,
    aiEnhanced,
    aiBlocks,
    llmKeyId,
  };
}
