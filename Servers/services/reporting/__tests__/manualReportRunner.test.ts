import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../index", () => ({ generateReport: jest.fn() }));
jest.mock("../../../utils/reportRun.utils", () => ({ updateRunStatusQuery: jest.fn() }));
jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile: jest.fn() }));
jest.mock("../../../controllers/reporting.ctrl", () => ({
  mapReportTypeToFileSource: jest.fn(() => "report"),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../utils/reportRunAnalysis.utils", () => ({
  upsertRunAnalysisQuery: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock("../../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(null),
}));

import { executeManualRun } from "../manualReportRunner";
import { generateReport } from "../index";
import { updateRunStatusQuery } from "../../../utils/reportRun.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { upsertRunAnalysisQuery } from "../../../utils/reportRunAnalysis.utils";
import { trackAIContent } from "../../../middleware/aiContentTracker.middleware";

const mockGenerate = generateReport as jest.MockedFunction<typeof generateReport>;
const mockUpdate = updateRunStatusQuery as jest.MockedFunction<typeof updateRunStatusQuery>;
const mockUpload = uploadFile as jest.MockedFunction<typeof uploadFile>;

const request: any = { projectId: 7, frameworkId: 1, projectFrameworkId: 2, reportType: "project", format: "pdf" };

describe("executeManualRun", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks the run success and stores the uploaded file id", async () => {
    mockGenerate.mockResolvedValue({ success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf" } as any);
    mockUpload.mockResolvedValue({ id: 42, filename: "r.pdf", content: Buffer.from("x") } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockGenerate).toHaveBeenCalledWith(request, 3, 5);
    expect(mockUpdate).toHaveBeenCalledWith(99, 5, expect.objectContaining({
      status: "success", file_id: 42, output_filename: "r.pdf", output_mime_type: "application/pdf",
    }));
  });

  it("marks the run failed when generation fails, and never uploads", async () => {
    mockGenerate.mockResolvedValue({ success: false, filename: "", content: Buffer.alloc(0), mimeType: "", error: "boom" } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(99, 5, expect.objectContaining({ status: "failed", error_message: "boom" }));
  });

  it("marks the run failed when generation throws", async () => {
    mockGenerate.mockRejectedValue(new Error("kaboom"));

    await executeManualRun(99, request, 3, 5);

    expect(mockUpdate).toHaveBeenCalledWith(99, 5, expect.objectContaining({ status: "failed", error_message: "kaboom" }));
  });

  it("marks the run failed when upload returns no file id", async () => {
    mockGenerate.mockResolvedValue({ success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf" } as any);
    mockUpload.mockResolvedValue({ filename: "r.pdf" } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockUpdate).toHaveBeenCalledWith(99, 5, expect.objectContaining({ status: "failed", error_message: "file upload returned no id" }));
    expect(mockUpdate).not.toHaveBeenCalledWith(99, 5, expect.objectContaining({ status: "success" }));
  });

  it("persists one row per analyzed section and records ai_status on the run", async () => {
    (generateReport as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
      analyses: {
        executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 },
        keyFindings: { payload: null, abstained: true, abstain_reason: "insufficient data", model: "gpt-4o-mini", attempts: 0 },
      },
    });
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });

    await executeManualRun(77, { projectId: 1 } as any, 3, 5);

    expect(upsertRunAnalysisQuery).toHaveBeenCalledTimes(2);
    expect(upsertRunAnalysisQuery).toHaveBeenCalledWith(
      expect.objectContaining({ report_run_id: 77, section_key: "executiveSummary", organization_id: 5, analyzed_by: 3 }),
    );
    expect(upsertRunAnalysisQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        section_key: "keyFindings",
        audit_metadata: expect.objectContaining({
          analyzer_version: expect.any(String),
          abstained: true,
          abstain_reason: "insufficient data",
          attempts: 0,
        }),
      }),
    );
    expect(updateRunStatusQuery).toHaveBeenCalledWith(
      77,
      5,
      expect.objectContaining({
        status: "success",
        ai_status: expect.objectContaining({ executiveSummary: "ok", keyFindings: "abstained" }),
      }),
    );
  });

  it("a failing analysis write does not fail the run", async () => {
    (generateReport as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
      analyses: { executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: null, attempts: 1 } },
    });
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });
    (upsertRunAnalysisQuery as jest.Mock).mockRejectedValue(new Error("db down"));

    await executeManualRun(77, { projectId: 1 } as any, 3, 5);

    expect(updateRunStatusQuery).toHaveBeenCalledWith(
      77,
      5,
      expect.objectContaining({
        status: "success",
        ai_status: expect.objectContaining({ executiveSummary: "write_failed" }),
      }),
    );
  });

  it("marks ai_status write_failed and skips the AI badge when the tenant guard rejects the write", async () => {
    (generateReport as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
      analyses: {
        executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 },
      },
    });
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });
    // undefined = the WHERE EXISTS tenant guard rejected the (run, org) pair — zero rows written.
    (upsertRunAnalysisQuery as jest.Mock).mockResolvedValue(undefined);

    await executeManualRun(77, { projectId: 1 } as any, 3, 5);

    expect(updateRunStatusQuery).toHaveBeenCalledWith(
      77,
      5,
      expect.objectContaining({
        status: "success",
        ai_status: { executiveSummary: "write_failed" },
      }),
    );
    expect(trackAIContent).not.toHaveBeenCalled();
  });

  it("badges the run as AI-generated only when a section actually produced output", async () => {
    (uploadFile as jest.Mock).mockResolvedValue({ id: 12, filename: "r.pdf" });
    (upsertRunAnalysisQuery as jest.Mock).mockResolvedValue({ id: 1 });

    // All sections abstained -> no AI content was written -> no badge.
    (generateReport as jest.Mock).mockResolvedValue({
      success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf",
      analyses: { executiveSummary: { payload: null, abstained: true, abstain_reason: "no data", model: null, attempts: 0 } },
    });
    await executeManualRun(77, { projectId: 1 } as any, 3, 5);
    expect(trackAIContent).not.toHaveBeenCalled();

    // One real section -> badge once, as genuine LLM output.
    (generateReport as jest.Mock).mockResolvedValue({
      success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf",
      analyses: { executiveSummary: { payload: { summary: "s" }, abstained: false, abstain_reason: null, model: "gpt-4o-mini", attempts: 1 } },
    });
    await executeManualRun(78, { projectId: 1 } as any, 3, 5);
    expect(trackAIContent).toHaveBeenCalledTimes(1);
    expect(trackAIContent).toHaveBeenCalledWith(
      5, "report_run", 78,
      expect.objectContaining({ badgeType: "generated", modelProvider: "llm" }),
      3,
    );
  });
});
