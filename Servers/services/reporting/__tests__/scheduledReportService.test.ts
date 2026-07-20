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

  it("rejects a malformed recipient address", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: { sendEmailLink: true, recipients: ["not-an-email"] },
    } as any);
    expect(errs.some((e) => /recipient/i.test(e) && /not-an-email/.test(e))).toBe(true);
  });

  it("names every malformed recipient, not just the first", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: {
        sendEmailLink: true,
        recipients: ["good@example.com", "bad1", "bad2"],
      },
    } as any);
    const joined = errs.join(" ");
    expect(joined).toContain("bad1");
    expect(joined).toContain("bad2");
    expect(joined).not.toContain("good@example.com");
  });

  it("accepts well-formed recipients", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: { sendEmailLink: true, recipients: ["a@example.com", "b.c+tag@sub.example.co.uk"] },
    } as any);
    expect(errs).toEqual([]);
  });

  it("does not validate recipients when no email channel is enabled", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: { saveToStorage: true, recipients: ["garbage"] },
    } as any);
    expect(errs).toEqual([]);
  });
});
