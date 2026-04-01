/**
 * Report Generation Service Unit Tests
 * Tests for the main report generation entry point
 */

// Mock dependencies before importing
jest.mock("../dataCollector", () => ({
  createDataCollector: jest.fn(),
}));

jest.mock("../pdfGenerator", () => ({
  generatePDF: jest.fn(),
  closeBrowser: jest.fn(),
}));

jest.mock("../docxGenerator", () => ({
  generateDOCX: jest.fn(),
}));

import { generateReport, getReportData, cleanup } from "../index";
import { createDataCollector } from "../dataCollector";
import { generatePDF, closeBrowser } from "../pdfGenerator";
import { generateDOCX } from "../docxGenerator";
import {
  ReportGenerationRequest,
  ReportData,
} from "../../../domain.layer/interfaces/i.reportGeneration";

describe("Report Generation Service", () => {
  const mockReportData: ReportData = {
    metadata: {
      projectId: 1,
      projectTitle: "Test Project",
      projectOwner: "John Doe",
      frameworkId: 1,
      frameworkName: "EU AI Act",
      projectFrameworkId: 1,
      generatedAt: new Date(),
      generatedBy: "Test User",
      organizationId: 1,
      isOrganizational: false,
    },
    branding: {
      organizationName: "Test Org",
      primaryColor: "#13715B",
      secondaryColor: "#1C2130",
    },
    charts: {},
    renderedCharts: {},
    sections: {
      projectRisks: {
        totalRisks: 5,
        risksByLevel: [],
        risks: [],
      },
    },
  };

  const mockDataCollector = {
    collectAllData: jest.fn().mockResolvedValue(mockReportData),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createDataCollector as jest.Mock).mockReturnValue(mockDataCollector);
  });

  describe("generateReport", () => {
    const baseRequest: ReportGenerationRequest = {
      projectId: 1,
      frameworkId: 1,
      projectFrameworkId: 1,
      reportType: "All reports",
      format: "pdf",
    };

    it("should generate PDF report successfully", async () => {
      const mockPdfResult = {
        success: true,
        filename: "test_report.pdf",
        content: Buffer.from("pdf content"),
        mimeType: "application/pdf",
      };
      (generatePDF as jest.Mock).mockResolvedValue(mockPdfResult);

      const result = await generateReport(baseRequest, 1, 1);

      expect(createDataCollector).toHaveBeenCalledWith(
        1,
        1,
        1,
        1,
        1
      );
      expect(mockDataCollector.collectAllData).toHaveBeenCalled();
      expect(generatePDF).toHaveBeenCalledWith(mockReportData);
      expect(result.success).toBe(true);
      expect(result.mimeType).toBe("application/pdf");
    });

    it("should generate DOCX report successfully", async () => {
      const mockDocxResult = {
        success: true,
        filename: "test_report.docx",
        content: Buffer.from("docx content"),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      (generateDOCX as jest.Mock).mockResolvedValue(mockDocxResult);

      const docxRequest = { ...baseRequest, format: "docx" as const };
      const result = await generateReport(docxRequest, 1, 1);

      expect(generateDOCX).toHaveBeenCalledWith(mockReportData);
      expect(result.success).toBe(true);
      expect(result.mimeType).toContain("wordprocessingml");
    });

    it("should apply custom branding", async () => {
      const mockPdfResult = {
        success: true,
        filename: "test.pdf",
        content: Buffer.from(""),
        mimeType: "application/pdf",
      };
      (generatePDF as jest.Mock).mockResolvedValue(mockPdfResult);

      const requestWithBranding = {
        ...baseRequest,
        branding: {
          organizationName: "Custom Org",
          primaryColor: "#FF0000",
        },
      };

      await generateReport(requestWithBranding, 1, 1);

      // Verify generatePDF was called with merged branding
      const callArg = (generatePDF as jest.Mock).mock.calls[0][0];
      expect(callArg.branding.organizationName).toBe("Custom Org");
      expect(callArg.branding.primaryColor).toBe("#FF0000");
    });

    it("should override filename when reportName is provided", async () => {
      const mockPdfResult = {
        success: true,
        filename: "original.pdf",
        content: Buffer.from(""),
        mimeType: "application/pdf",
      };
      (generatePDF as jest.Mock).mockResolvedValue(mockPdfResult);

      const requestWithName = {
        ...baseRequest,
        reportName: "custom_report",
      };

      const result = await generateReport(requestWithName, 1, 1);

      expect(result.filename).toBe("custom_report.pdf");
    });

    it("should handle report name with extension", async () => {
      const mockPdfResult = {
        success: true,
        filename: "original.pdf",
        content: Buffer.from(""),
        mimeType: "application/pdf",
      };
      (generatePDF as jest.Mock).mockResolvedValue(mockPdfResult);

      const requestWithName = {
        ...baseRequest,
        reportName: "custom_report.pdf",
      };

      const result = await generateReport(requestWithName, 1, 1);

      expect(result.filename).toBe("custom_report.pdf");
    });

    it("should handle array of report types", async () => {
      const mockPdfResult = {
        success: true,
        filename: "test.pdf",
        content: Buffer.from(""),
        mimeType: "application/pdf",
      };
      (generatePDF as jest.Mock).mockResolvedValue(mockPdfResult);

      const multiTypeRequest = {
        ...baseRequest,
        reportType: ["Project risks report", "Vendors and risks report"],
      };

      await generateReport(multiTypeRequest, 1, 1);

      // Should call collectAllData with appropriate sections
      expect(mockDataCollector.collectAllData).toHaveBeenCalled();
    });
  });

  describe("getReportData", () => {
    it("should return report data without generating file", async () => {
      const request = {
        projectId: 1,
        frameworkId: 1,
        projectFrameworkId: 1,
        reportType: "All reports",
      };

      const result = await getReportData(request, 1, 1);

      expect(createDataCollector).toHaveBeenCalled();
      expect(mockDataCollector.collectAllData).toHaveBeenCalled();
      expect(result).toEqual(mockReportData);
    });

    it("should apply custom branding to report data", async () => {
      const request = {
        projectId: 1,
        frameworkId: 1,
        projectFrameworkId: 1,
        reportType: "All reports",
        branding: {
          organizationName: "Custom Org",
        },
      };

      const result = await getReportData(request, 1, 1);

      expect(result.branding.organizationName).toBe("Custom Org");
    });
  });

  describe("cleanup", () => {
    it("should call closeBrowser", async () => {
      await cleanup();

      expect(closeBrowser).toHaveBeenCalled();
    });
  });
});
