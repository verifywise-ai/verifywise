/**
 * PDF Generator Unit Tests
 * Tests for Playwright-based PDF generation
 */

// Mock playwright before importing
const mockPage = {
  setContent: jest.fn(),
  waitForTimeout: jest.fn(),
  pdf: jest.fn(),
  close: jest.fn(),
  $: jest.fn(),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  isConnected: jest.fn().mockReturnValue(true),
  close: jest.fn(),
};

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

jest.mock("ejs", () => ({
  render: jest.fn().mockReturnValue("<html><body>Test</body></html>"),
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue("mock content"),
}));

import { generatePDF, closeBrowser, generatePDFWithOptions } from "../pdfGenerator";
import { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";

describe("PDF Generator", () => {
  const mockReportData: ReportData = {
    metadata: {
      projectId: 1,
      projectTitle: "Test Project",
      projectOwner: "John Doe",
      frameworkId: 1,
      frameworkName: "EU AI Act",
      projectFrameworkId: 1,
      generatedAt: new Date("2024-01-15"),
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
    sections: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPage.pdf.mockResolvedValue(Buffer.from("PDF content"));
  });

  describe("generatePDF", () => {
    it("should generate PDF successfully", async () => {
      const result = await generatePDF(mockReportData);

      expect(result.success).toBe(true);
      expect(result.mimeType).toBe("application/pdf");
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it("should create page and set content", async () => {
      await generatePDF(mockReportData);

      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setContent).toHaveBeenCalled();
    });

    it("should wait for content to load", async () => {
      await generatePDF(mockReportData);

      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
    });

    it("should call page.pdf with correct options", async () => {
      await generatePDF(mockReportData);

      expect(mockPage.pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "A4",
          printBackground: true,
          margin: expect.objectContaining({
            top: "0.75in",
            right: "0.75in",
            bottom: "0.75in",
            left: "0.75in",
          }),
        })
      );
    });

    it("should generate filename with project and framework names", async () => {
      const result = await generatePDF(mockReportData);

      expect(result.filename).toContain("Test_Project");
      expect(result.filename).toContain("EU_AI_Act");
      expect(result.filename.endsWith(".pdf")).toBe(true);
    });

    it("should close page after generation", async () => {
      await generatePDF(mockReportData);

      expect(mockPage.close).toHaveBeenCalled();
    });
  });

  describe("generatePDFWithOptions", () => {
    it("should use custom format", async () => {
      await generatePDFWithOptions(mockReportData, { format: "Letter" });

      expect(mockPage.pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "Letter",
        })
      );
    });

    it("should use landscape orientation", async () => {
      await generatePDFWithOptions(mockReportData, { landscape: true });

      expect(mockPage.pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          landscape: true,
        })
      );
    });

    it("should use custom scale", async () => {
      await generatePDFWithOptions(mockReportData, { scale: 0.8 });

      expect(mockPage.pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          scale: 0.8,
        })
      );
    });
  });

  describe("closeBrowser", () => {
    it("should close browser instance", async () => {
      // First generate a PDF to ensure browser is created
      await generatePDF(mockReportData);

      await closeBrowser();

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
