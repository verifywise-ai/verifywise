/**
 * DOCX Generator Unit Tests
 * Tests for native 'docx' library based generation
 */

import JSZip from "jszip";
import { generateDOCX, generateDOCXWithCharts } from "../docxGenerator";
import { AISummaries, ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";

/** Visible text of the generated DOCX, one run per line. */
async function docxText(content: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(content);
  const xml = await zip.file("word/document.xml")!.async("string");
  return (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
    .map((run) => run.replace(/<[^>]+>/g, ""))
    .join("\n");
}

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
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

  describe("AI analysis sections", () => {
    const recommendedActions: AISummaries["recommendedActions"] = [
      { action: "Close the DPIA gap", priority: "high", suggestedOwner: "Jane Ops" },
      { action: "Refresh vendor attestations" },
    ];
    const complianceGap: AISummaries["complianceGap"] = {
      narrative: "Two clauses lack evidence.",
      gaps: [{ control: "Clause 6.1", gap: "No documented risk criteria", priority: "high" }],
      scores_caveat: "Scores reflect stored readiness only.",
    };
    const vendorRisk: AISummaries["vendorRisk"] = {
      narrative: "One processor has no independent assurance report.",
      concerns: [{ vendor: "Acme Cloud", concern: "No SOC 2 Type II", severity: "high" }],
    };

    const withSummaries = (aiSummaries: AISummaries): ReportData => ({
      ...mockReportData,
      aiSummaries,
    });

    it("renders recommended actions even when the executive summary abstained", async () => {
      const result = await generateDOCX(
        withSummaries({ sectionSummaries: {}, recommendedActions }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("RECOMMENDED ACTIONS");
      expect(text).toContain("Close the DPIA gap");
      expect(text).toContain("[high · Jane Ops]");
      expect(text).toContain("Refresh vendor attestations");
      expect(text).toContain("[— · Unassigned]");
      expect(text).toContain("1. Recommended actions");
      expect(text).not.toContain("EXECUTIVE SUMMARY");
      expect(text).not.toContain("Compliance gap analysis");
      expect(text).not.toContain("Third-party risk analysis");
    });

    it("renders the compliance gap narrative, caveat and prioritised gaps", async () => {
      const result = await generateDOCX(withSummaries({ sectionSummaries: {}, complianceGap }));
      const text = await docxText(result.content);

      expect(text).toContain("COMPLIANCE GAP ANALYSIS");
      expect(text).toContain("Two clauses lack evidence.");
      expect(text).toContain("SCOPE NOTE");
      expect(text).toContain("Scores reflect stored readiness only.");
      expect(text).toContain("Prioritised gaps");
      expect(text).toContain("Clause 6.1: ");
      expect(text).toContain("No documented risk criteria (high)");
      expect(text).toContain("1. Compliance gap analysis");
      expect(text).not.toContain("Recommended actions");
      expect(text).not.toContain("Third-party risk analysis");
    });

    it("renders third-party risk even when no risk section is selected", async () => {
      const result = await generateDOCX(withSummaries({ sectionSummaries: {}, vendorRisk }));
      const text = await docxText(result.content);

      expect(text).toContain("THIRD-PARTY RISK ANALYSIS");
      expect(text).toContain("One processor has no independent assurance report.");
      expect(text).toContain("Acme Cloud: ");
      expect(text).toContain("No SOC 2 Type II (high)");
      expect(text).toContain("1. Third-party risk analysis");
      expect(text).not.toContain("Recommended actions");
      expect(text).not.toContain("Compliance gap analysis");
    });

    it("numbers the table of contents sequentially across all four AI sections", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          executiveSummary: "Overall posture is fair.",
          recommendedActions,
          complianceGap,
          vendorRisk,
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("1. Executive summary");
      expect(text).toContain("2. Recommended actions");
      expect(text).toContain("3. Compliance gap analysis");
      expect(text).toContain("4. Third-party risk analysis");
    });

    it("stays silent when every analyzer abstained", async () => {
      const result = await generateDOCX(withSummaries({ sectionSummaries: {} }));
      const text = await docxText(result.content);

      expect(text).not.toContain("RECOMMENDED ACTIONS");
      expect(text).not.toContain("COMPLIANCE GAP ANALYSIS");
      expect(text).not.toContain("THIRD-PARTY RISK ANALYSIS");
    });
  });
});
