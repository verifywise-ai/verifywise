import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repository/entity.repository", () => ({
  generateReport: vi.fn(),
}));

vi.mock("../../repository/file.repository", () => ({
  downloadFileFromManager: vi.fn(),
}));

vi.mock("../../../presentation/utils/browserDownload.utils", () => ({
  triggerBrowserDownload: vi.fn(),
  extractFilenameFromHeaders: vi.fn(),
}));

import { handleDownload, handleAutoDownload } from "../fileDownload";
import { generateReport } from "../../repository/entity.repository";
import { downloadFileFromManager } from "../../repository/file.repository";
import {
  triggerBrowserDownload,
  extractFilenameFromHeaders,
} from "../../../presentation/utils/browserDownload.utils";

const mockGenerateReport = vi.mocked(generateReport);
const mockDownloadFile = vi.mocked(downloadFileFromManager);
const mockTriggerDownload = vi.mocked(triggerBrowserDownload);
const mockExtractFilename = vi.mocked(extractFilenameFromHeaders);

describe("fileDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:url");
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
      style: {},
    } as unknown as HTMLElement);
  });

  describe("handleDownload", () => {
    it("downloads file and triggers browser download", async () => {
      const mockBlob = new Blob(["content"], { type: "text/plain" });
      mockDownloadFile.mockResolvedValue(mockBlob);

      await handleDownload("file-1", "report.pdf");

      expect(mockDownloadFile).toHaveBeenCalledWith({ id: "file-1" });
    });

    it("throws error when fileId is empty", async () => {
      await expect(handleDownload("", "report.pdf")).rejects.toThrow(
        "Cannot download file: missing file ID",
      );
    });

    it("rethrows errors from downloadFileFromManager", async () => {
      mockDownloadFile.mockRejectedValue(new Error("Network error"));

      await expect(handleDownload("file-1", "report.pdf")).rejects.toThrow("Network error");
    });
  });

  describe("handleAutoDownload", () => {
    const requestBody = {
      projectId: 1,
      projectTitle: "Test Project",
      projectOwner: "Owner",
      reportType: "compliance",
      reportName: "Report",
      frameworkId: 1,
      projectFrameworkId: 1,
      format: "pdf" as const,
    };

    it("generates report and triggers download on success", async () => {
      const mockHeaders = new Headers({ "Content-Type": "application/pdf" });
      mockGenerateReport.mockResolvedValue({
        status: 200,
        data: new ArrayBuffer(8),
        headers: mockHeaders,
      });
      mockExtractFilename.mockReturnValue("report.pdf");

      const status = await handleAutoDownload(requestBody);

      expect(status).toBe(200);
      expect(mockTriggerDownload).toHaveBeenCalled();
    });

    it("returns non-200 status without triggering download", async () => {
      mockGenerateReport.mockResolvedValue({
        status: 404,
        data: null,
        headers: new Headers(),
      });

      const status = await handleAutoDownload(requestBody);

      expect(status).toBe(404);
      expect(mockTriggerDownload).not.toHaveBeenCalled();
    });

    it("returns 500 when an exception occurs", async () => {
      mockGenerateReport.mockRejectedValue(new Error("Server error"));

      const status = await handleAutoDownload(requestBody);

      expect(status).toBe(500);
    });
  });
});
