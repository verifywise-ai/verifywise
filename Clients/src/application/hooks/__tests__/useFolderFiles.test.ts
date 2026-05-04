import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../repository/virtualFolder.repository", () => ({
  getFilesInFolder: vi.fn(),
  getUncategorizedFiles: vi.fn(),
  assignFilesToFolder: vi.fn(),
  removeFileFromFolder: vi.fn(),
  getFileFolders: vi.fn(),
  updateFileFolders: vi.fn(),
}));

vi.mock("../../repository/file.repository", () => ({
  getUserFilesMetaData: vi.fn(),
}));

vi.mock("../../utils/fileTransform.utils", () => ({
  transformFilesData: vi.fn((data) => data),
}));

import { useFolderFiles } from "../useFolderFiles";
import {
  getFilesInFolder,
  getUncategorizedFiles,
  assignFilesToFolder,
  getFileFolders,
} from "../../repository/virtualFolder.repository";
import { getUserFilesMetaData } from "../../repository/file.repository";

const mockGetFilesInFolder = vi.mocked(getFilesInFolder);
const mockGetUncategorized = vi.mocked(getUncategorizedFiles);
const mockAssignFiles = vi.mocked(assignFilesToFolder);
const mockGetFileFolders = vi.mocked(getFileFolders);
const mockGetUserFiles = vi.mocked(getUserFilesMetaData);

describe("useFolderFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserFiles.mockResolvedValue([]);
  });

  it("fetches uncategorized files when folder is 'uncategorized'", async () => {
    const files = [
      {
        id: 1,
        filename: "doc.pdf",
        size: 1024,
        mimetype: "application/pdf",
        upload_date: "2024-01-01",
        uploaded_by: 1,
        folders: [],
      },
    ];
    mockGetUncategorized.mockResolvedValue(files as any);

    const { result } = renderHook(() => useFolderFiles("uncategorized"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.files).toEqual(files);
  });

  it("fetches files in specific folder", async () => {
    const files = [
      {
        id: 2,
        filename: "report.xlsx",
        size: 2048,
        mimetype: "application/vnd.ms-excel",
        upload_date: "2024-02-01",
        uploaded_by: 2,
        folders: [],
      },
    ];
    mockGetFilesInFolder.mockResolvedValue(files as any);

    const { result } = renderHook(() => useFolderFiles(5));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetFilesInFolder).toHaveBeenCalledWith(5);
    expect(result.current.files).toEqual(files);
  });

  it("handles assign files to folder", async () => {
    mockGetFilesInFolder.mockResolvedValue([]);
    mockAssignFiles.mockResolvedValue(undefined as any);

    const { result } = renderHook(() => useFolderFiles(3));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success: boolean = false;
    await act(async () => {
      success = await result.current.handleAssignFilesToFolder(3, [1, 2]);
    });

    expect(success).toBe(true);
    expect(mockAssignFiles).toHaveBeenCalledWith(3, [1, 2]);
  });

  it("gets file current folders", async () => {
    mockGetUserFiles.mockResolvedValue([]);
    mockGetFileFolders.mockResolvedValue([{ id: 1, name: "Folder A" }] as any);

    const { result } = renderHook(() => useFolderFiles("all"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let folders: any;
    await act(async () => {
      folders = await result.current.getFileCurrentFolders(10);
    });

    expect(folders).toEqual([{ id: 1, name: "Folder A" }]);
  });

  it("handles error gracefully", async () => {
    mockGetUserFiles.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useFolderFiles("all"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load files");
  });
});
