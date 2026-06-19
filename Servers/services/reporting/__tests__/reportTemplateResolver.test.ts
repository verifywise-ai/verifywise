import { resolveReportRequest } from "../reportTemplateResolver";

const sched = {
  scope: "project", project_id: 5, framework_id: 1, project_framework_id: 2, format: "pdf", name: "Daily X",
  sections_config: { sections: [
    { key: "current_high_risks", reportSectionKey: "projectRisks", core: true, defaultEnabled: true },
    { key: "open_incidents", reportSectionKey: "incidentManagement", core: true, defaultEnabled: true },
  ] },
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
    const req = resolveReportRequest({ ...sched, scope: "organization", project_id: null,
      ai_blocks_config: { executiveSummary: false, keyFindings: false, recommendedActions: false } } as any, 99);
    expect(req.aiEnhanced).toBe(false);
  });
});
