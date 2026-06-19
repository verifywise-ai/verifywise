import { validateScheduledReportInput } from "../scheduledReportService";

const base = {
  templateId: 1, templateVersionId: 10, name: "X", scope: "project", projectId: 5,
  sectionsConfig: { sections: [{ key: "a", reportSectionKey: "projectRisks", label: "A", core: true, defaultEnabled: true, supportedScopes: ["project"] }] },
  aiBlocksConfig: { executiveSummary: true, keyFindings: true, recommendedActions: true },
  format: "pdf",
  scheduleConfig: { frequency: "daily", hour: 9, minute: 0, timezone: "UTC" },
  deliveryConfig: { saveToStorage: true, sendEmailLink: false, attachFile: false, recipients: [] },
};

describe("validateScheduledReportInput", () => {
  it("accepts a valid project-scope input", () => {
    expect(validateScheduledReportInput(base as any)).toEqual([]);
  });
  it("rejects project scope without projectId", () => {
    const errs = validateScheduledReportInput({ ...base, projectId: null } as any);
    expect(errs).toContain("project scope requires projectId");
  });
  it("rejects organization scope with projectId", () => {
    const errs = validateScheduledReportInput({ ...base, scope: "organization" } as any);
    expect(errs).toContain("organization scope must not set projectId");
  });
  it("requires at least one section", () => {
    const errs = validateScheduledReportInput({ ...base, sectionsConfig: { sections: [] } } as any);
    expect(errs).toContain("at least one section is required");
  });
  it("requires at least one delivery option", () => {
    const errs = validateScheduledReportInput({ ...base, deliveryConfig: { saveToStorage: false, sendEmailLink: false, attachFile: false, recipients: [] } } as any);
    expect(errs).toContain("at least one delivery option is required");
  });
  it("requires recipients when email/attachment enabled", () => {
    const errs = validateScheduledReportInput({ ...base, deliveryConfig: { saveToStorage: false, sendEmailLink: true, attachFile: false, recipients: [] } } as any);
    expect(errs).toContain("recipients required when email delivery is enabled");
  });
});
