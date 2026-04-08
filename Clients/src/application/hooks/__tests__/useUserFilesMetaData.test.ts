import { renderHook, waitFor, act } from "@testing-library/react";
import { useUserFilesMetaData } from "../useUserFilesMetaData";
import * as fileRepository from "../../repository/file.repository";

const mockGetFilesWithMetadata = fileRepository.getFilesWithMetadata as jest.Mock;

vi.mock("../../repository/file.repository", () => ({
  getFilesWithMetadata: vi.fn(),
}));

vi.mock("../utils/fileTransform.utils", () => ({
  transformFilesData: vi.fn((data: { files: unknown[] }) => data.files),
}));

describe("useUserFilesMetaData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty data", async () => {
      mockGetFilesWithMetadata.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUserFilesMetaData());

      expect(result.current.loading).toBe(true);
      expect(result.current.filesData).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe("successful fetch", () => {
    it("should return files data on successful fetch", async () => {
      const mockFiles = [
        { id: 1, name: "file1.pdf" },
        { id: 2, name: "file2.pdf" },
      ];

      mockGetFilesWithMetadata.mockResolvedValue({ files: mockFiles });

      const { result } = renderHook(() => useUserFilesMetaData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.filesData).toHaveLength(2);
      expect(result.current.filesData[0].id).toBe(1);
      expect(result.current.filesData[1].id).toBe(2);
      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetFilesWithMetadata.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useUserFilesMetaData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Network error");
    });

    it("should not set error on AbortError", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockGetFilesWithMetadata.mockRejectedValue(abortError);

      const { result } = renderHook(() => useUserFilesMetaData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it("should handle unknown error format", async () => {
      mockGetFilesWithMetadata.mockRejectedValue("Something went wrong");

      const { result } = renderHook(() => useUserFilesMetaData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Unknown error occurred");
    });
  });

  describe("refetch", () => {
    it("should refetch files when refetch is called", async () => {
      mockGetFilesWithMetadata
        .mockResolvedValueOnce({ files: [] })
        .mockResolvedValueOnce({ files: [{ id: 1, name: "new-file.pdf" }] });

      const { result } = renderHook(() => useUserFilesMetaData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetFilesWithMetadata).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(mockGetFilesWithMetadata).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("abort controller", () => {
    it("should abort previous request on unmount", async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");
      mockGetFilesWithMetadata.mockResolvedValue({ files: [] });

      const { unmount } = renderHook(() => useUserFilesMetaData());

      await waitFor(() => {
        expect(mockGetFilesWithMetadata).toHaveBeenCalled();
      });

      unmount();

      expect(abortSpy).toHaveBeenCalled();
    });
  });
});
