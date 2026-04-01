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
import { createDataCollector } from "./dataCollector";
import { generatePDF, closeBrowser } from "./pdfGenerator";
import { generateDOCX } from "./docxGenerator";
import logger from "../../utils/logger/fileLogger";

/**
 * Valid section keys that can be passed directly from the frontend
 */
const VALID_SECTION_KEYS = new Set([
  "projectRisks",
  "vendorRisks",
  "modelRisks",
  "compliance",
  "assessment",
  "clausesAndAnnexes",
  "nistSubcategories",
  "vendors",
  "models",
  "trainingRegistry",
  "policyManager",
  "incidentManagement",
  "all",
]);

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
  organizationId: number
): Promise<ReportGenerationResult> {
  try {
    // Create data collector
    const dataCollector = createDataCollector(
      organizationId,
      request.projectId,
      request.frameworkId,
      request.projectFrameworkId,
      userId
    );

    // Determine which sections to include
    const sections = getRequestedSections(request.reportType);

    // Collect all report data
    const reportData = await dataCollector.collectAllData(sections);

    // AI Enhancement (optional)
    if (request.aiEnhanced) {
      try {
        const { generateAISummaries } = await import("./aiSummarizer");
        reportData.aiSummaries = await generateAISummaries(
          reportData,
          reportData.metadata.organizationId,
          request.llmKeyId
        );
      } catch (error) {
        logger.warn("AI summarization failed, continuing with standard report:", error);
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

    return result;
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
  organizationId: number
): Promise<ReportData> {
  const dataCollector = createDataCollector(
    organizationId,
    request.projectId,
    request.frameworkId,
    request.projectFrameworkId,
    userId
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
