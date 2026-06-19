const generateReport = jest.fn();
const deliverReport = jest.fn();
const createRunQuery = jest.fn();
const updateRunStatusQuery = jest.fn();
jest.mock("../index", () => ({ generateReport: (...a:any)=>generateReport(...a) }));
jest.mock("../reportDeliveryService", () => ({ deliverReport: (...a:any)=>deliverReport(...a) }));
jest.mock("../../../utils/reportRun.utils", () => ({
  createRunQuery: (...a:any)=>createRunQuery(...a), updateRunStatusQuery: (...a:any)=>updateRunStatusQuery(...a),
}));
import { runScheduledReport } from "../reportRunOrchestrator";

const sched = { id: 3, organization_id: 1, owner_id: 9, template_id: 1, template_version_id: 10, format: "pdf",
  scope: "project", project_id: 5, sections_config: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
  ai_blocks_config: { executiveSummary: true }, delivery_config: { saveToStorage: true, sendEmailLink: false, attachFile: false, recipients: [] } };

describe("runScheduledReport", () => {
  beforeEach(() => { [generateReport, deliverReport, createRunQuery, updateRunStatusQuery].forEach(m=>m.mockReset()); createRunQuery.mockResolvedValue({ id: 77 }); });
  it("success path: generate + deliver -> success", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "success", fileId: 5 }, emailLink: { status: "skipped" }, attachment: { status: "skipped" }, fileId: 5 });
    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, expect.objectContaining({ status: "success" }));
  });
  it("delivery partial failure -> partial_success", async () => {
    generateReport.mockResolvedValue({ success: true, content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" });
    deliverReport.mockResolvedValue({ storage: { status: "failed" }, emailLink: { status: "skipped" }, attachment: { status: "skipped" } });
    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, expect.objectContaining({ status: "partial_success" }));
  });
  it("generation failure -> failed", async () => {
    generateReport.mockResolvedValue({ success: false, error: "boom" });
    await runScheduledReport(sched as any, { triggeredBy: "scheduler", scheduledFor: new Date() });
    expect(updateRunStatusQuery).toHaveBeenCalledWith(77, expect.objectContaining({ status: "failed" }));
  });
});
