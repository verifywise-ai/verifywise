const generateReport = jest.fn();
const deliverReport = jest.fn();
const createRunQuery = jest.fn();
const updateRunStatusQuery = jest.fn();
jest.mock("../index", () => ({ generateReport: (...a:any)=>generateReport(...a) }));
jest.mock("../reportDeliveryService", () => ({ deliverReport: (...a:any)=>deliverReport(...a) }));
jest.mock("../../../utils/reportRun.utils", () => ({
  createRunQuery: (...a:any)=>createRunQuery(...a), updateRunStatusQuery: (...a:any)=>updateRunStatusQuery(...a),
}));
jest.mock("../../../utils/reportRunAnalysis.utils", () => ({
  upsertRunAnalysisQuery: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock("../../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
import { runScheduledReport } from "../reportRunOrchestrator";
import { upsertRunAnalysisQuery } from "../../../utils/reportRunAnalysis.utils";

const sched = { id: 3, organization_id: 1, owner_id: 9, template_id: 1, template_version_id: 10, format: "pdf",
  scope: "project", project_id: 5, sections_config: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
  ai_blocks_config: { executiveSummary: true }, delivery_config: { saveToStorage: true, sendEmailLink: false, attachFile: false, recipients: [] } };

describe("runScheduledReport", () => {
  beforeEach(() => {
    [generateReport, deliverReport, createRunQuery, updateRunStatusQuery].forEach(m=>m.mockReset());
    (upsertRunAnalysisQuery as jest.Mock).mockReset().mockResolvedValue({ id: 1 });
    createRunQuery.mockResolvedValue({ id: 77 });
  });
  it("success path: generate + deliver -> success", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });
    const outcome = await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, sched.organization_id, expect.objectContaining({ status: "success" }));
    expect(outcome).toEqual({ runId: 77, status: "success" });
  });
  // report_runs has no project column: config_snapshot.project_id is the only
  // record of a run's project for a run-now report, and listRunsQuery reads it
  // to keep a project's report off a non-member's list.
  it("snapshots the run's project so the list can scope it by membership", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });
    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(createRunQuery).toHaveBeenCalledWith(
      expect.objectContaining({ config_snapshot: expect.objectContaining({ project_id: 5 }) }),
    );
  });
  it("snapshots a null project for an organization-scoped run", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });
    await runScheduledReport({ ...sched, project_id: null } as any, { triggeredBy: "manual", userId: 3 });
    expect(createRunQuery.mock.calls[0][0].config_snapshot.project_id).toBeNull();
  });
  it("delivery partial failure -> partial_success", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "failed" }, emailLink: { status: "skipped" }, attachment: { status: "skipped" } });
    const outcome = await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, sched.organization_id, expect.objectContaining({ status: "partial_success" }));
    expect(outcome).toEqual({ runId: 77, status: "partial_success" });
  });
  it("generation failure -> failed", async () => {
    generateReport.mockResolvedValue({ success: false, error: "boom" });
    const outcome = await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, sched.organization_id, expect.objectContaining({ status: "failed" }));
    expect(outcome).toEqual({ runId: 77, status: "failed", error: "boom" });
  });
  it("unexpected error (e.g. delivery throws) -> failed, with the run id still returned", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockRejectedValue(new Error("storage unreachable"));
    const outcome = await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(
      77,
      sched.organization_id,
      expect.objectContaining({ status: "failed", error_message: "storage unreachable" }),
    );
    expect(outcome).toEqual({ runId: 77, status: "failed", error: "storage unreachable" });
  });
  it("persists analyzer output and records ai_status on the run", async () => {
    generateReport.mockResolvedValue({
      success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf",
      analyses: {
        executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 },
      },
    });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });
    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(upsertRunAnalysisQuery).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: sched.organization_id, analyzed_by: sched.owner_id }),
    );
    expect(updateRunStatusQuery).toHaveBeenCalledWith(
      77,
      sched.organization_id,
      expect.objectContaining({
        status: "success",
        ai_status: expect.objectContaining({ executiveSummary: "ok" }),
      }),
    );
  });

  it("tells the generator which schedule this run belongs to", async () => {
    // Without it generateReport cannot find the previous run, and every
    // scheduled report is written as if it were the first.
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });

    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });

    expect(generateReport).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledReportId: 3 }),
      sched.owner_id,
      sched.organization_id,
    );
  });

  it("persists this run's facts snapshot so the next run can diff against it", async () => {
    const snapshot = {
      generatedAt: "2026-07-01T00:00:00.000Z",
      framework: "EU AI Act",
      subject: "Test Project",
      sections: { projectRisks: { totalRisks: 5 } },
    };
    generateReport.mockResolvedValue({
      success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf",
      factsSnapshot: snapshot,
      analyses: {
        executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 },
      },
    });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });

    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });

    expect(upsertRunAnalysisQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        audit_metadata: expect.objectContaining({ facts: snapshot }),
      }),
    );
  });
});
