import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../index", () => ({ generateReport: jest.fn() }));
jest.mock("../../../utils/reportRun.utils", () => ({ updateRunStatusQuery: jest.fn() }));
jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile: jest.fn() }));
jest.mock("../../../controllers/reporting.ctrl", () => ({
  mapReportTypeToFileSource: jest.fn(() => "report"),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { executeManualRun } from "../manualReportRunner";
import { generateReport } from "../index";
import { updateRunStatusQuery } from "../../../utils/reportRun.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";

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
    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({
      status: "success", file_id: 42, output_filename: "r.pdf", output_mime_type: "application/pdf",
    }));
  });

  it("marks the run failed when generation fails, and never uploads", async () => {
    mockGenerate.mockResolvedValue({ success: false, filename: "", content: Buffer.alloc(0), mimeType: "", error: "boom" } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({ status: "failed", error_message: "boom" }));
  });

  it("marks the run failed when generation throws", async () => {
    mockGenerate.mockRejectedValue(new Error("kaboom"));

    await executeManualRun(99, request, 3, 5);

    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({ status: "failed", error_message: "kaboom" }));
  });

  it("marks the run failed when upload returns no file id", async () => {
    mockGenerate.mockResolvedValue({ success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf" } as any);
    mockUpload.mockResolvedValue({ filename: "r.pdf" } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({ status: "failed", error_message: "file upload returned no id" }));
    expect(mockUpdate).not.toHaveBeenCalledWith(99, expect.objectContaining({ status: "success" }));
  });
});
