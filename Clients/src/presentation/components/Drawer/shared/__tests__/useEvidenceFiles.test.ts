import { renderHook, act } from "@testing-library/react";
import { useEvidenceFiles } from "../useEvidenceFiles";

const mockGetFileById = vi.fn();
const mockGetEntityFiles = vi.fn();

vi.mock("../../../../../application/repository/file.repository", () => ({
  getFileById: (...args: unknown[]) => mockGetFileById(...args),
  getEntityFiles: (...args: unknown[]) => mockGetEntityFiles(...args),
}));

function setup(onAlert = vi.fn()) {
  const { result } = renderHook(() =>
    useEvidenceFiles({ frameworkType: "iso42001", entityType: "annex", onAlert }),
  );
  return { result, onAlert };
}

describe("useEvidenceFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntityFiles.mockResolvedValue({ files: [] });
  });

  describe("loadFiles", () => {
    it("merges legacy links with linked files, deduping by id", async () => {
      mockGetEntityFiles.mockResolvedValue({
        files: [{ id: 2, filename: "linked.pdf", size: 100, mimetype: "application/pdf" }],
      });
      const { result } = setup();

      await act(async () => {
        await result.current.loadFiles(10, [{ id: "1", fileName: "legacy.pdf" } as any]);
      });

      const ids = result.current.evidenceFiles.map((f) => f.id).sort();
      expect(ids).toEqual(["1", "2"]);
    });

    it("prefers the legacy entry when the same id exists in both sources", async () => {
      mockGetEntityFiles.mockResolvedValue({
        files: [{ id: 1, filename: "from-links.pdf" }],
      });
      const { result } = setup();

      await act(async () => {
        await result.current.loadFiles(10, [{ id: "1", fileName: "from-legacy.pdf" } as any]);
      });

      expect(result.current.evidenceFiles).toHaveLength(1);
      expect(result.current.evidenceFiles[0].fileName).toBe("from-legacy.pdf");
    });

    it("tolerates a missing legacy list", async () => {
      mockGetEntityFiles.mockResolvedValue({
        files: [{ id: 5, filename: "only-linked.pdf" }],
      });
      const { result } = setup();

      await act(async () => {
        await result.current.loadFiles(10);
      });

      expect(result.current.evidenceFiles).toHaveLength(1);
    });

    it("falls back to an empty linked-files list when the request fails", async () => {
      mockGetEntityFiles.mockRejectedValue(new Error("network error"));
      const { result } = setup();

      await act(async () => {
        await result.current.loadFiles(10, [{ id: "1", fileName: "legacy.pdf" } as any]);
      });

      expect(result.current.evidenceFiles).toEqual([
        expect.objectContaining({ id: "1", fileName: "legacy.pdf" }),
      ]);
    });
  });

  describe("handleAddFiles", () => {
    it("appends the given files to uploadFiles and alerts", () => {
      const { result, onAlert } = setup();
      const file = new File(["content"], "new.pdf", { type: "application/pdf" });

      act(() => {
        result.current.handleAddFiles([file]);
      });

      expect(result.current.uploadFiles).toHaveLength(1);
      expect(result.current.uploadFiles[0].fileName).toBe("new.pdf");
      expect(onAlert).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "info", body: expect.stringContaining("1 file") }),
      );
    });
  });

  describe("handleAttachExistingFiles", () => {
    it("queues the selected files for attach and alerts", () => {
      const { result, onAlert } = setup();

      act(() => {
        result.current.handleAttachExistingFiles([{ id: "9", fileName: "existing.pdf" } as any]);
      });

      expect(result.current.pendingAttachFiles).toHaveLength(1);
      expect(onAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "info" }));
    });

    it("does nothing when given an empty selection", () => {
      const { result, onAlert } = setup();

      act(() => {
        result.current.handleAttachExistingFiles([]);
      });

      expect(result.current.pendingAttachFiles).toHaveLength(0);
      expect(onAlert).not.toHaveBeenCalled();
    });
  });

  describe("handleRemovePendingAttach", () => {
    it("removes the file from the attach queue and alerts", () => {
      const { result, onAlert } = setup();

      act(() => {
        result.current.handleAttachExistingFiles([{ id: "9", fileName: "existing.pdf" } as any]);
      });
      act(() => {
        result.current.handleRemovePendingAttach("9");
      });

      expect(result.current.pendingAttachFiles).toHaveLength(0);
      expect(onAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: "File removed from attach queue." }),
      );
    });
  });

  describe("handleDeleteEvidenceFile", () => {
    it("moves a valid file id from evidenceFiles into deletedFileIds", async () => {
      mockGetEntityFiles.mockResolvedValue({ files: [{ id: 3, filename: "a.pdf" }] });
      const { result, onAlert } = setup();

      await act(async () => {
        await result.current.loadFiles(10);
      });
      act(() => {
        result.current.handleDeleteEvidenceFile("3");
      });

      expect(result.current.evidenceFiles).toHaveLength(0);
      expect(result.current.deletedFileIds).toEqual([3]);
      expect(onAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          variant: "info",
          body: expect.stringContaining("marked for deletion"),
        }),
      );
    });

    it("alerts with an error and does not mutate state for a non-numeric id", () => {
      const { result, onAlert } = setup();

      act(() => {
        result.current.handleDeleteEvidenceFile("not-a-number");
      });

      expect(result.current.deletedFileIds).toEqual([]);
      expect(onAlert).toHaveBeenCalledWith({ variant: "error", body: "Invalid file ID" });
    });
  });

  describe("handleDeleteUploadFile", () => {
    it("removes the file from the upload queue and alerts", () => {
      const { result, onAlert } = setup();
      const file = new File(["content"], "new.pdf");

      act(() => {
        result.current.handleAddFiles([file]);
      });
      const uploadedId = result.current.uploadFiles[0].id;
      act(() => {
        result.current.handleDeleteUploadFile(uploadedId);
      });

      expect(result.current.uploadFiles).toHaveLength(0);
      expect(onAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: "File removed from upload queue." }),
      );
    });
  });

  describe("handleDownloadFile", () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      revokeObjectURL = vi.fn();
      window.URL.createObjectURL = createObjectURL as unknown as typeof window.URL.createObjectURL;
      window.URL.revokeObjectURL = revokeObjectURL as unknown as typeof window.URL.revokeObjectURL;
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    afterEach(() => {
      clickSpy.mockRestore();
    });

    it("downloads the file and shows a success alert", async () => {
      mockGetFileById.mockResolvedValue(new ArrayBuffer(4));
      const { result, onAlert } = setup();

      await act(async () => {
        await result.current.handleDownloadFile("7", "report.pdf");
      });

      expect(mockGetFileById).toHaveBeenCalledWith({ id: "7", responseType: "arraybuffer" });
      expect(createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(onAlert).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success", body: "File downloaded successfully" }),
      );
    });

    it("shows an error alert when the download fails", async () => {
      mockGetFileById.mockRejectedValue(new Error("network error"));
      const { result, onAlert } = setup();

      await act(async () => {
        await result.current.handleDownloadFile("7", "report.pdf");
      });

      expect(onAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          body: expect.stringContaining("Failed to download"),
        }),
      );
    });
  });

  describe("resetPending", () => {
    it("clears uploadFiles, pendingAttachFiles, and deletedFileIds without touching evidenceFiles", async () => {
      mockGetEntityFiles.mockResolvedValue({ files: [{ id: 1, filename: "a.pdf" }] });
      const { result } = setup();

      await act(async () => {
        await result.current.loadFiles(10);
      });
      act(() => {
        result.current.handleAddFiles([new File(["x"], "new.pdf")]);
        result.current.handleAttachExistingFiles([{ id: "2", fileName: "existing.pdf" } as any]);
        result.current.handleDeleteEvidenceFile("1");
      });
      act(() => {
        result.current.resetPending();
      });

      expect(result.current.uploadFiles).toEqual([]);
      expect(result.current.pendingAttachFiles).toEqual([]);
      expect(result.current.deletedFileIds).toEqual([]);
    });
  });

  describe("showFilePicker", () => {
    it("toggles via setShowFilePicker", () => {
      const { result } = setup();

      expect(result.current.showFilePicker).toBe(false);
      act(() => {
        result.current.setShowFilePicker(true);
      });
      expect(result.current.showFilePicker).toBe(true);
    });
  });
});
