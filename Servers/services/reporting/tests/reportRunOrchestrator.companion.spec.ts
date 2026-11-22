/**
 * A run that produces the internal fix-it list as a companion file (spec 8.6):
 * the companion is always stored, before the formal report is delivered, even
 * when "Save to storage" is off; it is never emailed; and a fix-it list that
 * fails takes the run down with it (both or neither).
 *
 * The real deliverReport runs here, so "two uploads" and "the email carries
 * the formal file only" are checked at the storage and email boundaries.
 */
const generateReport = jest.fn();
const createRunQuery = jest.fn();
const updateRunStatusQuery = jest.fn();
const uploadFile = jest.fn();
const sendAutomationEmail = jest.fn();

jest.mock("../index", () => ({ generateReport: (...a: any) => generateReport(...a) }));
jest.mock("../../../utils/reportRun.utils", () => ({
  createRunQuery: (...a: any) => createRunQuery(...a),
  updateRunStatusQuery: (...a: any) => updateRunStatusQuery(...a),
}));
jest.mock("../../../utils/fileUpload.utils", () => ({
  uploadFile: (...a: any) => uploadFile(...a),
}));
jest.mock("../../emailService", () => ({
  sendAutomationEmail: (...a: any) => sendAutomationEmail(...a),
}));
jest.mock("../../../tools/mjmlCompiler", () => ({
  compileMjmlToHtml: jest.fn().mockResolvedValue("<html></html>"),
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
  logStructuredError: jest.fn(),
}));

import { runScheduledReport } from "../reportRunOrchestrator";

const FORMAL = {
  content: Buffer.from("formal"),
  filename: "E23 report.pdf",
  mimeType: "application/pdf",
};
const COMPANION = {
  content: Buffer.from("fix-it"),
  filename: "E23 report_fix-it-list.pdf",
  mimeType: "application/pdf",
};

const sched = (delivery: Record<string, unknown>) => ({
  id: 3,
  organization_id: 1,
  owner_id: 9,
  template_id: 1,
  template_version_id: 10,
  format: "pdf",
  scope: "organization",
  project_id: null,
  sections_config: { sections: [{ reportSectionKey: "e23FixItList", defaultEnabled: true }] },
  ai_blocks_config: {},
  delivery_config: {
    saveToStorage: false,
    sendEmailLink: false,
    attachFile: false,
    recipients: [],
    ...delivery,
  },
});

const run = (delivery: Record<string, unknown> = {}) =>
  runScheduledReport(sched(delivery) as any, { triggeredBy: "manual", userId: 9 });

const finalUpdate = () =>
  updateRunStatusQuery.mock.calls[updateRunStatusQuery.mock.calls.length - 1][2];

beforeEach(() => {
  jest.clearAllMocks();
  createRunQuery.mockResolvedValue({ id: 77 });
  generateReport.mockResolvedValue({ success: true, ...FORMAL, companion: COMPANION });
  let nextId = 500;
  uploadFile.mockImplementation(async () => ({ id: nextId++ }));
  sendAutomationEmail.mockResolvedValue(undefined);
});

describe("runScheduledReport with a fix-it companion", () => {
  it("stores the companion even when Save to storage is off, and records it on the run", async () => {
    const outcome = await run({ saveToStorage: false });

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile.mock.calls[0][0]).toMatchObject({
      originalname: COMPANION.filename,
      mimetype: COMPANION.mimeType,
      buffer: COMPANION.content,
    });
    // Same storage as the formal report: org-level, "All reports", the run's organization.
    expect(uploadFile.mock.calls[0].slice(1)).toEqual([9, null, "All reports", 1]);
    expect(outcome).toEqual({ runId: 77, status: "success" });
    expect(finalUpdate()).toMatchObject({
      status: "success",
      companion_file_id: 500,
      companion_filename: COMPANION.filename,
      companion_mime_type: COMPANION.mimeType,
    });
    expect(finalUpdate().file_id).toBeUndefined();
  });

  it("uploads both files, the companion first, when Save to storage is on", async () => {
    await run({ saveToStorage: true });

    expect(uploadFile.mock.calls.map((c) => c[0].originalname)).toEqual([
      COMPANION.filename,
      FORMAL.filename,
    ]);
    expect(finalUpdate()).toMatchObject({
      file_id: 501,
      output_filename: FORMAL.filename,
      companion_file_id: 500,
    });
  });

  it("fails the run and delivers nothing when the companion cannot be stored", async () => {
    uploadFile.mockRejectedValueOnce(new Error("disk full"));

    const outcome = await run({
      saveToStorage: true,
      sendEmailLink: true,
      attachFile: true,
      recipients: ["a@example.com"],
    });

    expect(outcome.status).toBe("failed");
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(finalUpdate()).toMatchObject({ status: "failed" });
    expect(finalUpdate().error_message).toContain("disk full");
    expect(finalUpdate().companion_file_id).toBeUndefined();
  });

  it("fails the run and stores nothing when generation fails (fix-it render included)", async () => {
    generateReport.mockResolvedValue({
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: "The fix-it list could not be generated: boom",
    });

    const outcome = await run({ saveToStorage: true, attachFile: true, recipients: ["a@x.io"] });

    expect(outcome).toEqual({
      runId: 77,
      status: "failed",
      error: "The fix-it list could not be generated: boom",
    });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(sendAutomationEmail).not.toHaveBeenCalled();
  });

  it("emails the formal report only: one attachment, and a link to the formal download", async () => {
    await run({
      saveToStorage: true,
      sendEmailLink: true,
      attachFile: true,
      recipients: ["a@example.com"],
    });

    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
    const [, subject, , attachments] = sendAutomationEmail.mock.calls[0];
    expect(subject).toContain(FORMAL.filename);
    expect(subject).not.toContain("fix-it");
    expect(attachments).toEqual([
      { filename: FORMAL.filename, content: FORMAL.content, contentType: FORMAL.mimeType },
    ]);
    const { compileMjmlToHtml } = jest.requireMock("../../../tools/mjmlCompiler");
    const slots = compileMjmlToHtml.mock.calls[0][1];
    expect(slots.downloadButtonHtml).toContain('/runs/77/download"');
    expect(slots.downloadButtonHtml).not.toContain("fix-it");
  });

  it("keeps the companion and marks the run partial when only the formal storage fails", async () => {
    uploadFile
      .mockImplementationOnce(async () => ({ id: 500 }))
      .mockRejectedValueOnce(new Error("bucket gone"));

    const outcome = await run({ saveToStorage: true });

    expect(outcome.status).toBe("partial_success");
    expect(finalUpdate()).toMatchObject({ companion_file_id: 500 });
  });

  it("keeps the stored files when the run fails late, after delivery", async () => {
    // persistAnalyses or the status write throwing after delivery: the formal
    // report may already be stored or emailed, so neither file is taken back.
    updateRunStatusQuery.mockRejectedValueOnce(new Error("db down"));

    const outcome = await run({ saveToStorage: true });

    expect(outcome.status).toBe("failed");
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(finalUpdate()).toMatchObject({ status: "failed" });
  });

  it("stores no companion for a run without one", async () => {
    generateReport.mockResolvedValue({ success: true, ...FORMAL });

    await run({ saveToStorage: true });

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile.mock.calls[0][0].originalname).toBe(FORMAL.filename);
    expect(finalUpdate().companion_file_id).toBeUndefined();
  });
});
