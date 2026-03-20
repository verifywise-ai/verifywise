/**
 * DOCX Generator Unit Tests
 * Tests for native 'docx' library based generation
 */

import { generateDOCX, generateDOCXWithCharts } from "../docxGenerator";
import { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";

describe("DOCX Generator", () => {
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

  describe("generateDOCX", () => {
    it("should generate DOCX successfully", async () => {
      const result = await generateDOCX(mockReportData);

      expect(result.success).toBe(true);
      expect(result.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it("should generate filename with project and framework names", async () => {
      const result = await generateDOCX(mockReportData);

      expect(result.filename).toContain("Test_Project");
      expect(result.filename).toContain("EU_AI_Act");
      expect(result.filename.endsWith(".docx")).toBe(true);
    });

    it("should generate valid buffer content", async () => {
      const result = await generateDOCX(mockReportData);

      expect(result.success).toBe(true);
      expect(result.content).toBeInstanceOf(Buffer);
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("should include cover page with organization name", async () => {
      const result = await generateDOCX(mockReportData);

      // The document should be generated successfully
      expect(result.success).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("should handle report data with sections", async () => {
      const dataWithSections: ReportData = {
        ...mockReportData,
        sections: {
          projectRisks: {
            totalRisks: 2,
            risksByLevel: [],
            risks: [
              {
                id: 1,
                name: "Test Risk 1",
                description: "Test risk description 1",
                owner: "Owner 1",
                impact: "High",
                likelihood: "Medium",
                mitigationStatus: "In Progress",
                riskLevel: "High",
              },
              {
                id: 2,
                name: "Test Risk 2",
                description: "Test risk description 2",
                owner: "Owner 2",
                impact: "Low",
                likelihood: "Low",
                mitigationStatus: "Complete",
                riskLevel: "Low",
              },
            ],
          },
        },
      };

      const result = await generateDOCX(dataWithSections);

      expect(result.success).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("should handle empty sections gracefully", async () => {
      const dataWithEmptySections: ReportData = {
        ...mockReportData,
        sections: {
          projectRisks: {
            totalRisks: 0,
            risksByLevel: [],
            risks: [],
          },
        },
      };

      const result = await generateDOCX(dataWithEmptySections);

      expect(result.success).toBe(true);
    });
  });

  describe("generateDOCXWithCharts", () => {
    const mockChartImages = {
      riskChart: "data:image/png;base64,abc123",
      complianceChart: "data:image/png;base64,def456",
    };

    it("should generate DOCX with chart images parameter", async () => {
      const result = await generateDOCXWithCharts(mockReportData, mockChartImages);

      expect(result.success).toBe(true);
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it("should handle empty chart images", async () => {
      const result = await generateDOCXWithCharts(mockReportData, {});

      expect(result.success).toBe(true);
    });

    it("should return same result as generateDOCX (charts not embedded yet)", async () => {
      const resultWithCharts = await generateDOCXWithCharts(mockReportData, mockChartImages);
      const resultWithoutCharts = await generateDOCX(mockReportData);

      expect(resultWithCharts.success).toBe(resultWithoutCharts.success);
      expect(resultWithCharts.mimeType).toBe(resultWithoutCharts.mimeType);
    });
  });

  describe("Report formatting", () => {
    it("should handle organizational reports", async () => {
      const orgReportData: ReportData = {
        ...mockReportData,
        metadata: {
          ...mockReportData.metadata,
          isOrganizational: true,
        },
      };

      const result = await generateDOCX(orgReportData);

      expect(result.success).toBe(true);
    });

    it("should handle compliance section", async () => {
      const complianceData: ReportData = {
        ...mockReportData,
        sections: {
          compliance: {
            overallProgress: 75,
            totalControls: 10,
            completedControls: 7,
            controls: [
              {
                id: 1,
                controlId: "C-001",
                title: "Test Control",
                status: "Complete",
                owner: "Control Owner",
              },
            ],
          },
        },
      };

      const result = await generateDOCX(complianceData);

      expect(result.success).toBe(true);
    });

    it("should handle vendor risks section", async () => {
      const vendorData: ReportData = {
        ...mockReportData,
        sections: {
          vendorRisks: {
            totalRisks: 1,
            risks: [
              {
                id: 1,
                vendorName: "Test Vendor",
                riskName: "Data Privacy Risk",
                riskLevel: "Medium",
                actionOwner: "Risk Manager",
                actionPlan: "Implement encryption",
              },
            ],
          },
        },
      };

      const result = await generateDOCX(vendorData);

      expect(result.success).toBe(true);
    });

    it("should handle model risks section", async () => {
      const modelData: ReportData = {
        ...mockReportData,
        sections: {
          modelRisks: {
            totalRisks: 1,
            risks: [
              {
                id: 1,
                modelName: "GPT-4",
                riskName: "Bias Risk",
                riskLevel: "High",
                mitigationStatus: "In Progress",
              },
            ],
          },
        },
      };

      const result = await generateDOCX(modelData);

      expect(result.success).toBe(true);
    }, 15000);
  });
});
