/**
 * Scheduled-report email attachment regression test.
 *
 * The attachment bytes must come from the in-memory generation result, not
 * the files row returned by uploadFile: under S3-compatible object storage
 * the row's content column is NULL by design, and emailing that would send
 * empty attachments.
 */

const mockQuery = jest.fn<any>();
jest.mock("../../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

const mockUploadFile = jest.fn<any>();
jest.mock("../../../utils/fileUpload.utils", () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
}));

const mockGenerateReport = jest.fn<any>();
jest.mock("../../reporting", () => ({
  generateReport: (...args: any[]) => mockGenerateReport(...args),
}));

jest.mock("../../../controllers/reporting.ctrl", () => ({
  mapReportTypeToFileSource: jest.fn(() => "Project risks report"),
}));

const mockEnqueue = jest.fn<any>();
jest.mock("../automationProducer", () => ({
  automationQueue: { add: jest.fn(), obliterate: jest.fn() },
  enqueueAutomationAction: (...args: any[]) => mockEnqueue(...args),
  enqueueRiskLinkRecompute: jest.fn(),
  enqueueVendorRiskLinkRecompute: jest.fn(),
}));

jest.mock("../../../utils/automation/reporting.automation.utils", () => ({
  buildReportingReplacements: jest.fn<any>().mockResolvedValue({}),
}));

jest.mock("../../../utils/automation/automation.utils", () => ({
  replaceTemplateVariables: jest.fn((template: string) => template),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  __esModule: true,
}));

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { sendReportNotificationEmail } from "../automationWorker";
import logger from "../../../utils/logger/fileLogger";

const JOB_DATA = {
  automation: {
    id: "42",
    action_key: "send_report_notification_email",
    user_id: 5,
    params: { subject: "Your report", body: "Attached" },
    automation_params: {
      reportType: ["Project risks report"],
      projectId: "3",
      reportLevel: "project",
    },
    automation_id: 42,
  },
  organizationId: 7,
  projectDetails: { framework_id: 1, project_framework_id: 2, owner: 5 },
  full_name: "Owner Name",
  organization_name: "Test Org",
};

const GENERATED = {
  success: true,
  filename: "project-risks.docx",
  content: Buffer.from("DOCX-BYTES"),
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[{ exists: true }]]);
  mockGenerateReport.mockResolvedValue(GENERATED);
});

describe("sendReportNotificationEmail", () => {
  it("attaches the in-memory generated buffer even when the stored row has NULL content (S3)", async () => {
    // Simulates the row shape under S3 storage: bytes are external, content NULL.
    mockUploadFile.mockResolvedValue({
      id: 11,
      filename: GENERATED.filename,
      type: GENERATED.mimeType,
      content: null,
    });

    await sendReportNotificationEmail(JOB_DATA);

    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: GENERATED.content }),
      JOB_DATA.automation.user_id,
      3,
      "Project risks report",
      JOB_DATA.organizationId,
    );

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [, jobPayload] = mockEnqueue.mock.calls[0] as [string, any];
    expect(jobPayload.attachments).toHaveLength(1);
    expect(jobPayload.attachments[0]).toEqual({
      filename: GENERATED.filename,
      content: GENERATED.content,
      contentType: GENERATED.mimeType,
    });
  });

  it("sends no attachment when report generation fails", async () => {
    mockGenerateReport.mockResolvedValue({ success: false, error: "boom" });

    await sendReportNotificationEmail(JOB_DATA);

    expect(mockUploadFile).not.toHaveBeenCalled();
    const [, jobPayload] = mockEnqueue.mock.calls[0] as [string, any];
    expect(jobPayload.attachments).toEqual([]);
  });

  it("still attaches a report with gaps and warns about what could not be read", async () => {
    mockGenerateReport.mockResolvedValue({
      ...GENERATED,
      collectionFailures: ["SOC 2 for Chatbot"],
    });
    mockUploadFile.mockResolvedValue({
      id: 11,
      filename: GENERATED.filename,
      type: GENERATED.mimeType,
    });

    await sendReportNotificationEmail(JOB_DATA);

    const [, jobPayload] = mockEnqueue.mock.calls[0] as [string, any];
    expect(jobPayload.attachments).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Report generated with gaps: SOC 2 for Chatbot could not be read."),
    );
  });
});
