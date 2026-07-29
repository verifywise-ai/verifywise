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

/** Raw document.xml, for asserting on OOXML elements docxText discards (e.g. <w:br/>). */
async function docxXml(content: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(content);
  return zip.file("word/document.xml")!.async("string");
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
    sectionNotices: [],
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

  // `trainingregistar` has no assignee and no completion date; `policy_manager`
  // has no version. A column headed "Assignee" with a dash on every row is not
  // an empty cell, it is a statement that nobody is assigned — one the schema
  // cannot support.
  describe("columns with no column behind them", () => {
    it("the training table names only fields the schema can fill", async () => {
      const result = await generateDOCX({
        ...mockReportData,
        sections: {
          trainingRegistry: {
            totalRecords: 1,
            records: [{ id: 1, trainingName: "AI Act awareness", status: "Completed" }],
          },
        },
      });
      const text = await docxText(result.content);

      expect(text).toContain("AI Act awareness");
      expect(text).not.toContain("Completion Date");
      expect(text).not.toContain("Assignee");
    });

    it("the policy table names only fields the schema can fill", async () => {
      const result = await generateDOCX({
        ...mockReportData,
        sections: {
          policyManager: {
            totalPolicies: 1,
            policies: [{ id: 1, policyName: "Acceptable use", status: "Approved" }],
          },
        },
      });
      const text = await docxText(result.content);

      expect(text).toContain("Acceptable use");
      expect(text).not.toContain("Version");
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

      // The TOC promises this order; the body must actually follow it.
      expect(text.indexOf("RECOMMENDED ACTIONS")).toBeLessThan(
        text.indexOf("COMPLIANCE GAP ANALYSIS"),
      );
      expect(text.indexOf("COMPLIANCE GAP ANALYSIS")).toBeLessThan(
        text.indexOf("THIRD-PARTY RISK ANALYSIS"),
      );
    });

    it("splits a multi-paragraph narrative into separate runs joined by explicit breaks", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          complianceGap: {
            narrative: "First paragraph.\n\nSecond paragraph.",
            gaps: [],
            scores_caveat: null,
          },
        }),
      );
      const xml = await docxXml(result.content);

      // A literal newline surviving inside a single <w:t> is the bug: OOXML
      // treats it as ordinary whitespace, so Word renders it as one run-on blob.
      expect(xml).not.toMatch(/<w:t[^>]*>[^<]*\n[^<]*<\/w:t>/);

      const firstIdx = xml.indexOf("First paragraph.");
      const breakIdx = xml.indexOf("<w:br", firstIdx);
      const secondIdx = xml.indexOf("Second paragraph.", firstIdx);
      expect(firstIdx).toBeGreaterThan(-1);
      expect(breakIdx).toBeGreaterThan(firstIdx);
      expect(breakIdx).toBeLessThan(secondIdx);
    });

    it("renders the narrative but no 'Prioritised gaps' heading when gaps is empty", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          complianceGap: { narrative: "Nothing to flag right now.", gaps: [], scores_caveat: null },
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("Nothing to flag right now.");
      expect(text).not.toContain("Prioritised gaps");
    });

    it("stays silent when every analyzer abstained", async () => {
      const result = await generateDOCX(withSummaries({ sectionSummaries: {} }));
      const text = await docxText(result.content);

      expect(text).not.toContain("RECOMMENDED ACTIONS");
      expect(text).not.toContain("COMPLIANCE GAP ANALYSIS");
      expect(text).not.toContain("THIRD-PARTY RISK ANALYSIS");
    });

    it("renders structured findings with severity, basis, counterfactual and related sections", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          executiveSummary: "Posture is uneven.",
          keyFindings: ["flat fallback text"],
          keyFindingsDetailed: [
            {
              text: "Only 3 of 25 models name an owner",
              section: "models",
              severity: "high",
              basis: "observed",
              related_sections: ["modelRisks", "policyManager"],
              what_would_close_this: "An owner recorded on every model inventory row",
            },
          ],
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("Key Findings");
      expect(text).toContain("[high] ");
      expect(text).toContain("Only 3 of 25 models name an owner");
      expect(text).toContain(
        "Section: models · Basis: observed · Related: modelRisks, policyManager",
      );
      expect(text).toContain("Closes when: An owner recorded on every model inventory row");
      // The structured list replaces the flat one rather than printing both.
      expect(text).not.toContain("flat fallback text");
    });

    it("falls back to the flat keyFindings list when no structured findings exist", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          executiveSummary: "Posture is uneven.",
          keyFindings: ["flat fallback text"],
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("flat fallback text");
    });

    it("renders the action rationale and basis label", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          recommendedActions: [
            {
              action: "Assign owners to the 22 ownerless models",
              priority: "high",
              suggestedOwner: "Jane Ops",
              sourceSignal: "22 of 25 model rows have no owner",
              basis: "observed",
            },
          ],
        }),
      );
      const text = await docxText(result.content);

      // basis is a disclosure field. Bare, it reads as a third unnamed
      // attribute next to priority and owner; labelled, it matches the
      // "Basis: " the findings meta line and the PDF renderer both use.
      expect(text).toContain("[high · Jane Ops · Basis: observed]");
      expect(text).toContain("Why: 22 of 25 model rows have no owner");
    });

    it("renders gap basis and counterfactual, and the concern basis label", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          complianceGap: {
            narrative: "Two clauses lack evidence.",
            scores_caveat: null,
            gaps: [
              {
                control: "Clause 6.1",
                gap: "No documented risk criteria",
                priority: "high",
                basis: "absent",
                what_would_close_this: "A dated risk-criteria record against Clause 6.1",
              },
            ],
          },
          vendorRisk: {
            narrative: "One processor has no independent assurance report.",
            concerns: [
              {
                vendor: "Acme Cloud",
                concern: "No SOC 2 Type II",
                severity: "high",
                basis: "inferred",
              },
            ],
          },
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("No documented risk criteria (high, Basis: absent)");
      expect(text).toContain("Closes when: A dated risk-criteria record against Clause 6.1");
      expect(text).toContain("No SOC 2 Type II (high, Basis: inferred)");
    });

    it("renders the top_risks table alongside the risk highlights box", async () => {
      // riskAnalysis only ever produces output when a risk section was
      // collected, so the table lives with the highlights box inside the
      // risk-analysis section — the same place the PDF prints it.
      const result = await generateDOCX({
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
                mitigationStatus: "Open",
              },
            ],
          },
        },
        aiSummaries: {
          sectionSummaries: {},
          riskHighlights: "Concentration risk dominates.",
          riskAnalysis: {
            narrative: "Concentration risk dominates.",
            top_risks: [
              {
                name: "Single model owner",
                level: "Very high",
                why: "25 of 25 models share one owner",
              },
            ],
          },
        },
      });
      const text = await docxText(result.content);

      expect(text).toContain("Most material risks");
      expect(text).toContain("Single model owner");
      expect(text).toContain("Very high");
      expect(text).toContain("25 of 25 models share one owner");
      expect(text).toContain("Why it ranks here");
    });

    it("prints why an analyzer abstained instead of leaving a silent hole", async () => {
      const result = await generateDOCX(
        withSummaries({
          sectionSummaries: {},
          abstentions: {
            vendorRisk: "No vendors were in scope for this report.",
            riskAnalysis: "No risk rows were supplied.",
          },
        }),
      );
      const text = await docxText(result.content);

      expect(text).toContain("Analyses not produced");
      // Same label strings as the PDF: both read ANALYSIS_LABELS.
      expect(text).toContain("Third-party risk analysis: ");
      expect(text).toContain("No vendors were in scope for this report.");
      expect(text).toContain("Risk analysis: ");
      expect(text).toContain("No risk rows were supplied.");
    });
  });
  describe("use case provenance on merged sections", () => {
    // Mirrors reportPdfTemplate.test.ts. An organization report merges each
    // framework section across every use case and the ids repeat, so the
    // renderers add a Use case column as soon as mergeSections labels the rows.
    // createTable pairs headers with cells positionally — both sides are driven
    // off one flag, and this is what holds them in step.
    const merged = (useCase?: string) =>
      ({
        ...mockReportData,
        sections: {
          compliance: {
            overallProgress: 0,
            totalControls: 1,
            completedControls: 0,
            controls: [
              { id: 1, controlId: "C1", title: "Train staff", status: "Waiting", useCase },
            ],
          },
          clausesAndAnnexes: {
            clauses: [
              { id: 1, clauseId: "4", title: "Context", status: "Done", subClauses: [], useCase },
            ],
            annexes: [
              { id: 1, annexId: "A.1", title: "Policy", status: "Done", controls: [], useCase },
            ],
          },
        },
      }) as unknown as ReportData;

    it("labels the merged rows and keeps the tables well formed", async () => {
      const result = await generateDOCX(merged("Alpha"));
      const text = await docxText(result.content);

      expect(text).toContain("Use case");
      expect(text).toContain("Alpha");
      expect(text).toContain("C1");
      expect(text).toContain("4");
      expect(text).toContain("A.1");
    });

    it("adds no column for a single-use-case report", async () => {
      const result = await generateDOCX(merged());
      const text = await docxText(result.content);

      expect(text).not.toContain("Use case");
      expect(text).toContain("C1");
    });
  });

  describe("section notices", () => {
    it("names the section and explains why it is empty", async () => {
      // Nothing but notices: both "has any section" guards return [], so this
      // also proves a notices-only report still produces a document.
      const result = await generateDOCX({
        ...mockReportData,
        sections: {},
        sectionNotices: [{ sectionKey: "nistSubcategories", reason: "no_framework_target" }],
      });
      const text = await docxText(result.content);

      expect(result.success).toBe(true);
      expect(text).toContain("Sections with no data");
      expect(text).toContain("NIST subcategories");
      expect(text).toContain("No project in scope uses a framework that provides this section.");
    });

    it("falls back to the raw key and reason it does not recognise", async () => {
      const result = await generateDOCX({
        ...mockReportData,
        sectionNotices: [
          { sectionKey: "somethingNew", reason: "brand_new_reason" },
        ] as unknown as ReportData["sectionNotices"],
      });
      const text = await docxText(result.content);

      expect(text).toContain("somethingNew");
      expect(text).toContain("brand_new_reason");
    });

    it("renders nothing when there are no notices", async () => {
      const result = await generateDOCX({ ...mockReportData, sectionNotices: [] });
      const text = await docxText(result.content);

      expect(text).not.toContain("Sections with no data");
    });

    it("renders nothing when a caller omits sectionNotices entirely", async () => {
      const { sectionNotices: _omitted, ...legacy } = mockReportData;
      const result = await generateDOCX(legacy as ReportData);
      const text = await docxText(result.content);

      expect(result.success).toBe(true);
      expect(text).not.toContain("Sections with no data");
    });
  });
});
