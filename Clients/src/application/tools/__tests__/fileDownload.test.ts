import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repository/file.repository", () => ({
  downloadFileFromManager: vi.fn(),
}));

import { handleDownload } from "../fileDownload";
import { downloadFileFromManager } from "../../repository/file.repository";

const mockDownloadFile = vi.mocked(downloadFileFromManager);

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
});
