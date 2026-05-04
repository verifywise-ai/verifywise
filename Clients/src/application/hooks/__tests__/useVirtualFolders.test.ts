import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../repository/virtualFolder.repository", () => ({
  getFolderTree: vi.fn(),
  getAllFolders: vi.fn(),
  getFolderPath: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

import { useVirtualFolders } from "../useVirtualFolders";
import {
  getFolderTree,
  getAllFolders,
  getFolderPath,
  createFolder,
  deleteFolder,
} from "../../repository/virtualFolder.repository";

const mockGetFolderTree = vi.mocked(getFolderTree);
const mockGetAllFolders = vi.mocked(getAllFolders);
const mockGetFolderPath = vi.mocked(getFolderPath);
const mockCreateFolder = vi.mocked(createFolder);
const mockDeleteFolder = vi.mocked(deleteFolder);

describe("useVirtualFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFolderTree.mockResolvedValue([]);
    mockGetAllFolders.mockResolvedValue([]);
  });

  it("loads folders on mount", async () => {
    const tree = [{ id: 1, name: "Root", children: [] }];
    const flat = [{ id: 1, name: "Root", file_count: 3 }];
    mockGetFolderTree.mockResolvedValue(tree as any);
    mockGetAllFolders.mockResolvedValue(flat as any);

    const { result } = renderHook(() => useVirtualFolders());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.folderTree).toEqual(tree);
    expect(result.current.folders).toEqual(flat);
    expect(result.current.selectedFolder).toBe("all");
  });

  it("handles error on load", async () => {
    mockGetFolderTree.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useVirtualFolders());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load folders");
    expect(result.current.folderTree).toEqual([]);
  });

  it("creates a folder and refreshes", async () => {
    mockGetFolderTree.mockResolvedValue([]);
    mockGetAllFolders.mockResolvedValue([]);
    mockCreateFolder.mockResolvedValue({ id: 2, name: "New" } as any);

    const { result } = renderHook(() => useVirtualFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let newFolder: any;
    await act(async () => {
      newFolder = await result.current.handleCreateFolder({ name: "New" } as any);
    });

    expect(newFolder).toEqual({ id: 2, name: "New" });
    expect(mockCreateFolder).toHaveBeenCalled();
  });

  it("deletes a folder and resets selection if deleted was selected", async () => {
    mockGetFolderTree.mockResolvedValue([]);
    mockGetAllFolders.mockResolvedValue([]);
    mockDeleteFolder.mockResolvedValue(undefined as any);
    mockGetFolderPath.mockResolvedValue([{ id: 5, name: "Test" }] as any);

    const { result } = renderHook(() => useVirtualFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Select folder 5
    act(() => {
      result.current.setSelectedFolder(5);
    });

    // Delete the selected folder
    await act(async () => {
      await result.current.handleDeleteFolder(5);
    });

    expect(result.current.selectedFolder).toBe("all");
  });

  it("sets breadcrumb when selecting a numeric folder", async () => {
    mockGetFolderTree.mockResolvedValue([]);
    mockGetAllFolders.mockResolvedValue([]);
    mockGetFolderPath.mockResolvedValue([
      { id: 1, name: "Root" },
      { id: 3, name: "Sub" },
    ] as any);

    const { result } = renderHook(() => useVirtualFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSelectedFolder(3);
    });

    await waitFor(() => expect(result.current.loadingBreadcrumb).toBe(false));
    expect(mockGetFolderPath).toHaveBeenCalledWith(3);
  });
});
