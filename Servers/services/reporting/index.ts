/**
 * Report Generation Service
 * Main entry point for the new reporting system
 * Following VerifyWise clean architecture patterns
 */

import {
  ReportGenerationRequest,
  ReportGenerationResult,
  ReportData,
} from "../../domain.layer/interfaces/i.reportGeneration";
import { ReportType } from "../../domain.layer/models/reporting/reporting.model";
import { createDataCollector, createScopedDataCollector } from "./dataCollector";
import { resolveFrameworkTargets } from "./reportScope";
import { generatePDF, closeBrowser } from "./pdfGenerator";
import { generateDOCX } from "./docxGenerator";
import logger from "../../utils/logger/fileLogger";
import { runAnalyzers } from "./analyzers/runAnalyzers";
import {
  collectAllowedOwners,
  collectEvidenceGapsInput,
  collectFactsInput,
  collectPriorFacts,
  collectReadinessInput,
  resolveBlocks,
} from "./analyzers/collectAnalyzerInputs";
import { mapAnalysesToSummaries } from "./analyzers/mapToSummaries";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { SECTION_KEYS } from "./sectionCatalog";

/**
 * Valid section keys that can be passed directly from the frontend.
 * Derived from the section catalog plus the "all" wildcard sentinel, which is
 * not a section. See services/reporting/sectionCatalog.ts.
 */
const VALID_SECTION_KEYS = new Set([...SECTION_KEYS, "all"]);

/**
 * Map report type strings to section keys
 * Supports both legacy report type strings and new section keys
 */
function getRequestedSections(reportType: string | string[]): string[] {
  // Legacy mapping for old report type strings
  const typeToSection: Record<string, string> = {
    [ReportType.PROJECTRISK_REPORT]: "projectRisks",
    [ReportType.VENDOR_REPORT]: "vendors",
    [ReportType.COMPLIANCE_REPORT]: "compliance",
    [ReportType.ASSESSMENT_REPORT]: "assessment",
    [ReportType.CLAUSES_AND_ANNEXES_REPORT]: "clausesAndAnnexes",
    [ReportType.CLAUSES_REPORT]: "clausesAndAnnexes",
    [ReportType.ANNEXES_REPORT]: "clausesAndAnnexes",
    [ReportType.MODEL_REPORT]: "models",
    [ReportType.TRAINING_REGISTRY_REPORT]: "trainingRegistry",
    [ReportType.POLICY_MANAGER_REPORT]: "policyManager",
    [ReportType.ALL_REPORT]: "all",
    // New section-based report types (for backward compat with UI labels)
    "Use case risks report": "projectRisks",
  };

  if (Array.isArray(reportType)) {
    const sections = new Set<string>();
    reportType.forEach((type) => {
      // First check if it's a valid section key (new format)
      if (VALID_SECTION_KEYS.has(type)) {
        sections.add(type);
      } else {
        // Fall back to legacy mapping
        const section = typeToSection[type];
        if (section) {
          sections.add(section);
        }
      }
    });
    // If we got valid sections, return them; otherwise default to all
    return sections.size > 0 ? Array.from(sections) : ["all"];
  }

  // Single string - check if it's a valid section key first
  if (VALID_SECTION_KEYS.has(reportType)) {
    return [reportType];
  }

  // Fall back to legacy mapping
  const section = typeToSection[reportType];
  return section ? [section] : ["all"];
}

/**
 * Generate a report in the specified format
 */
export async function generateReport(
  request: ReportGenerationRequest,
  userId: number,
  organizationId: number,
): Promise<ReportGenerationResult> {
  try {
    // A scoped request states what the report covers and lets the pairings be
    // derived; an unscoped one (the legacy manual path) names them outright.
    const targets = request.scope
      ? await resolveFrameworkTargets(request.scope, request.projectId || null, organizationId)
      : [];
    const dataCollector = request.scope
      ? createScopedDataCollector(
          organizationId,
          userId,
          request.scope,
          targets,
          request.projectId || null,
        )
      : createDataCollector(
          organizationId,
          request.projectId,
          request.frameworkId,
          request.projectFrameworkId,
          userId,
        );

    // Determine which sections to include
    const sections = getRequestedSections(request.reportType);

    // Collect all report data
    const reportData = await dataCollector.collectAllData(sections);

    // AI analysis (optional, per-block gated)
    let analyses: Record<string, any> | undefined;
    // `unknown`, matching ReportGenerationResult.factsSnapshot: nothing between
    // here and the JSONB column inspects it, so importing FactsSnapshot into
    // this file would buy nothing.
    let factsSnapshot: unknown;
    if (request.aiEnhanced) {
      try {
        const blocks = resolveBlocks(request);
        const keys = await getLLMKeysWithKeyQuery(reportData.metadata.organizationId);
        const llmKey =
          (request.llmKeyId ? keys?.find((k: any) => k.id === request.llmKeyId) : null) ??
          keys?.[0] ??
          null;

        // Deterministic whole-estate aggregates, for every analyzer and every
        // block combination. Still no LLM call; the one query is the prior
        // snapshot.
        //
        // Design §10: a scheduled run diffs against the last run of the same
        // schedule. A manual run has no schedule, priorFacts stays null, and
        // renderFacts emits no change block — exactly what renders today.
        const priorFacts = await collectPriorFacts(
          request.scheduledReportId,
          reportData.metadata.organizationId,
        );
        const { facts, snapshot } = collectFactsInput(reportData, priorFacts);
        factsSnapshot = snapshot;

        // Both readiness and evidence-gap lookups key off a framework id. A
        // scoped request has none of its own — the ids on the request are 0
        // there — so take them from the resolved pairings. Feeding the zero
        // through made both return empty, and the complianceGap analyzer read
        // that as "no gaps".
        //
        // The first pairing, not all of them: both inputs describe one
        // framework, and the analyzer's prompt is written for one.
        const primary = targets[0];
        const analyzerProjectId = request.scope
          ? request.scope === "project"
            ? primary?.projectId
            : undefined // readiness is stored per project; see collectReadinessInput
          : request.projectId;
        const analyzerFrameworkId = request.scope ? primary?.frameworkId : request.frameworkId;

        // Two independent inputs, fetched in parallel and kept separate.
        const extras = blocks.complianceGap
          ? await (async () => {
              const [readiness, evidenceGaps] = await Promise.all([
                collectReadinessInput(
                  analyzerProjectId,
                  analyzerFrameworkId,
                  reportData.metadata.organizationId,
                  userId,
                ),
                collectEvidenceGapsInput(
                  analyzerFrameworkId,
                  reportData.metadata.organizationId,
                ),
              ]);
              return { readiness, evidenceGaps, facts };
            })()
          : { facts };

        analyses = await runAnalyzers({
          reportData,
          llmKey: llmKey as any,
          blocks,
          extras,
          allowedOwners: collectAllowedOwners(reportData),
        });

        reportData.aiSummaries = mapAnalysesToSummaries(analyses, reportData.aiSummaries);
      } catch (error) {
        // Analysis is never allowed to lose the report.
        logger.warn("Report analysis failed, continuing with standard report:", error);
      }
    }

    // Apply custom branding if provided
    if (request.branding) {
      reportData.branding = {
        ...reportData.branding,
        ...request.branding,
      };
    }

    // Generate report in requested format
    let result: ReportGenerationResult;

    if (request.format === "pdf") {
      result = await generatePDF(reportData);
    } else {
      result = await generateDOCX(reportData);
    }

    // Override filename if custom name provided
    if (request.reportName && result.success) {
      const extension = request.format === "pdf" ? ".pdf" : ".docx";
      result.filename = request.reportName.endsWith(extension)
        ? request.reportName
        : `${request.reportName}${extension}`;
    }

    // Mark AI-enhanced reports in the filename for frontend badge detection
    if (request.aiEnhanced && result.success && reportData.aiSummaries) {
      const ext = request.format === "pdf" ? ".pdf" : ".docx";
      const baseName = result.filename.replace(ext, "");
      result.filename = `${baseName}_AI_${ext}`;
    }

    return { ...result, analyses, factsSnapshot };
  } catch (error) {
    console.error("Error generating report:", error);
    return {
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error generating report",
    };
  }
}

/**
 * Generate report and return data only (for preview)
 */
export async function getReportData(
  request: Omit<ReportGenerationRequest, "format">,
  userId: number,
  organizationId: number,
): Promise<ReportData> {
  // Same two paths as generateReport: a scoped request must preview what the
  // produced report would contain, or the two disagree.
  const targets = request.scope
    ? await resolveFrameworkTargets(request.scope, request.projectId || null, organizationId)
    : [];
  const dataCollector = request.scope
    ? createScopedDataCollector(
        organizationId,
        userId,
        request.scope,
        targets,
        request.projectId || null,
      )
    : createDataCollector(
        organizationId,
        request.projectId,
        request.frameworkId,
        request.projectFrameworkId,
        userId,
      );

  const sections = getRequestedSections(request.reportType);
  const reportData = await dataCollector.collectAllData(sections);

  if (request.branding) {
    reportData.branding = {
      ...reportData.branding,
      ...request.branding,
    };
  }

  return reportData;
}

/**
 * Cleanup resources (call on server shutdown)
 */
export async function cleanup(): Promise<void> {
  await closeBrowser();
}

// Re-export types and utilities
export {
  ReportFormat,
  ReportGenerationRequest,
  ReportGenerationResult,
  ReportData,
} from "../../domain.layer/interfaces/i.reportGeneration";

export { createDataCollector } from "./dataCollector";
export { generatePDF, generatePDFWithOptions } from "./pdfGenerator";
export { generateDOCX, generateDOCXWithCharts } from "./docxGenerator";
export {
  generateRiskDistributionChart,
  generateRiskDonutChart,
  generateComplianceProgressChart,
  generateRiskLegend,
  generateAssessmentStatusChart,
  generateAssessmentLegend,
} from "./chartUtils";
