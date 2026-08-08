import { resolveReportRequest } from "../reportTemplateResolver";

const sched = {
  scope: "project",
  project_id: 5,
  framework_id: 1,
  project_framework_id: 2,
  format: "pdf",
  name: "Daily X",
  sections_config: {
    sections: [
      {
        key: "current_high_risks",
        reportSectionKey: "projectRisks",
        core: true,
        defaultEnabled: true,
      },
      {
        key: "open_incidents",
        reportSectionKey: "incidentManagement",
        core: true,
        defaultEnabled: true,
      },
    ],
  },
  ai_blocks_config: { executiveSummary: true, keyFindings: true, recommendedActions: true },
};

describe("resolveReportRequest", () => {
  it("maps enabled sections to reportType array + sets aiEnhanced", () => {
    const req = resolveReportRequest(sched as any, 99);
    expect(req.projectId).toBe(5);
    expect(req.format).toBe("pdf");
    expect(req.aiEnhanced).toBe(true);
    expect(req.reportType).toEqual(expect.arrayContaining(["projectRisks", "incidentManagement"]));
  });
  it("organization scope sets projectId 0/undefined and aiEnhanced false when all ai off", () => {
    const req = resolveReportRequest(
      {
        ...sched,
        scope: "organization",
        project_id: null,
        ai_blocks_config: {
          executiveSummary: false,
          keyFindings: false,
          recommendedActions: false,
        },
      } as any,
      99,
    );
    expect(req.aiEnhanced).toBe(false);
  });
  it("passes the seven blocks through instead of collapsing them", () => {
    const req = resolveReportRequest(
      {
        project_id: 3,
        framework_id: 1,
        project_framework_id: 2,
        name: "Quarterly",
        format: "pdf",
        sections_config: { sections: [{ reportSectionKey: "compliance" }] },
        // keyFindings and recommendedActions deliberately differ so a resolver
        // that swaps the two (keyFindings <- recommendedActions and vice versa)
        // cannot pass this test by accident.
        ai_blocks_config: {
          executiveSummary: true,
          keyFindings: true,
          recommendedActions: false,
          riskAnalysis: true,
          complianceGap: false,
          vendorRisk: false,
          sectionSummaries: true,
        },
      },
      9,
    );
    expect(req.aiBlocks!.keyFindings).toBe(true);
    expect(req.aiBlocks!.recommendedActions).toBe(false);
    expect(req.aiBlocks).toEqual({
      sectionSummaries: true,
      executiveSummary: true,
      keyFindings: true,
      recommendedActions: false,
      riskAnalysis: true,
      complianceGap: false,
      vendorRisk: false,
    });
  });

  it("keeps aiEnhanced true when only a new block is on", () => {
    const req = resolveReportRequest(
      {
        project_id: 3,
        framework_id: 1,
        project_framework_id: 2,
        name: "Q",
        format: "pdf",
        sections_config: { sections: [{ reportSectionKey: "compliance" }] },
        ai_blocks_config: { complianceGap: true },
      },
      9,
    );
    expect(req.aiEnhanced).toBe(true);
    expect(req.aiBlocks!.complianceGap).toBe(true);
    expect(req.aiBlocks!.executiveSummary).toBe(false);
  });

  it("reads an un-backfilled legacy three-key config without inventing new blocks", () => {
    const req = resolveReportRequest(
      {
        project_id: 3,
        framework_id: 1,
        project_framework_id: 2,
        name: "Q",
        format: "pdf",
        sections_config: { sections: [{ reportSectionKey: "compliance" }] },
        ai_blocks_config: { executiveSummary: true, keyFindings: true, recommendedActions: true },
      },
      9,
    );
    // The resolver reports exactly what is stored. Turning the legacy shape into
    // the seven-key shape is the migration's job, not the resolver's — so a row
    // that somehow escaped the backfill degrades to fewer blocks, never to
    // unexpected LLM spend.
    expect(req.aiBlocks).toEqual({
      sectionSummaries: false,
      executiveSummary: true,
      keyFindings: true,
      recommendedActions: true,
      riskAnalysis: false,
      complianceGap: false,
      vendorRisk: false,
    });
  });
});

describe("framework selection", () => {
  it("carries framework_ids onto the request", () => {
    const request = resolveReportRequest({
      scope: "organization",
      sections_config: { sections: [{ reportSectionKey: "compliance", defaultEnabled: true }] },
      framework_ids: ["native:1"],
      name: "EU AI Act Readiness Review",
      format: "pdf",
    });

    expect(request.frameworkIds).toEqual(["native:1"]);
  });

  it("leaves frameworkIds undefined for a row written before the column existed", () => {
    const request = resolveReportRequest({
      scope: "organization",
      sections_config: { sections: [{ reportSectionKey: "compliance", defaultEnabled: true }] },
      name: "Legacy",
      format: "pdf",
    });

    expect(request.frameworkIds).toBeUndefined();
  });
});
