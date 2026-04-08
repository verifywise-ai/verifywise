import { renderHook, waitFor, act } from "@testing-library/react";
import { useVirtualFolders } from "../useVirtualFolders";
import * as virtualFolderRepository from "../../repository/virtualFolder.repository";

const mockGetFolderTree = virtualFolderRepository.getFolderTree as jest.Mock;
const mockGetAllFolders = virtualFolderRepository.getAllFolders as jest.Mock;
const mockGetFolderPath = virtualFolderRepository.getFolderPath as jest.Mock;
const mockCreateFolder = virtualFolderRepository.createFolder as jest.Mock;
const mockUpdateFolder = virtualFolderRepository.updateFolder as jest.Mock;
const mockDeleteFolder = virtualFolderRepository.deleteFolder as jest.Mock;

vi.mock("../../repository/virtualFolder.repository", () => ({
  getFolderTree: vi.fn(),
  getAllFolders: vi.fn(),
  getFolderPath: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

describe("useVirtualFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty data", async () => {
      mockGetFolderTree.mockImplementation(() => new Promise(() => {}));
      mockGetAllFolders.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useVirtualFolders());

      expect(result.current.loading).toBe(true);
      expect(result.current.folderTree).toEqual([]);
      expect(result.current.folders).toEqual([]);
    });
  });

  describe("successful fetch", () => {
    it("should return folder data on successful fetch", async () => {
      const mockTree = [{ id: 1, name: "Folder 1", children: [] }];
      const mockFlat = [{ id: 1, name: "Folder 1", count: 5 }];

      mockGetFolderTree.mockResolvedValue(mockTree);
      mockGetAllFolders.mockResolvedValue(mockFlat);

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.folderTree).toEqual(mockTree);
      expect(result.current.folders).toEqual(mockFlat);
      expect(result.current.error).toBeNull();
    });

    it("should handle empty folders", async () => {
      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.folderTree).toEqual([]);
      expect(result.current.folders).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetFolderTree.mockRejectedValue(new Error("Network error"));
      mockGetAllFolders.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load folders");
    });
  });

  describe("setSelectedFolder", () => {
    it("should set selected folder to 'all'", async () => {
      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.setSelectedFolder("all");
      });

      expect(result.current.selectedFolder).toBe("all");
      expect(result.current.breadcrumb).toEqual([]);
    });

    it("should load breadcrumb when selecting a folder by id", async () => {
      const mockPath = [
        { id: 1, name: "Root" },
        { id: 2, name: "Subfolder" },
      ];

      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);
      mockGetFolderPath.mockResolvedValue(mockPath);

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.setSelectedFolder(2);
      });

      await waitFor(() => {
        expect(result.current.loadingBreadcrumb).toBe(false);
      });

      expect(mockGetFolderPath).toHaveBeenCalledWith(2);
      expect(result.current.breadcrumb).toEqual(mockPath);
    });
  });

  describe("handleCreateFolder", () => {
    it("should create folder and refresh", async () => {
      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);
      mockCreateFolder.mockResolvedValue({ id: 1, name: "New Folder" });

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let newFolder: { id: number; name: string } | null = null;
      await act(async () => {
        newFolder = await result.current.handleCreateFolder({ name: "New Folder" });
      });

      expect(mockCreateFolder).toHaveBeenCalledWith({ name: "New Folder" });
      expect(newFolder).toEqual({ id: 1, name: "New Folder" });
    });

    it("should handle create error", async () => {
      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);
      mockCreateFolder.mockRejectedValue(new Error("Failed to create"));

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.handleCreateFolder({ name: "New Folder" });
      });

      expect(result.current.error).toBe("Failed to create");
    });
  });

  describe("handleDeleteFolder", () => {
    it("should delete folder and refresh", async () => {
      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);
      mockDeleteFolder.mockResolvedValue(undefined);

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.handleDeleteFolder(1);
      });

      expect(mockDeleteFolder).toHaveBeenCalledWith(1);
      expect(success).toBe(true);
    });
  });

  describe("refreshFolders", () => {
    it("should provide refresh function", async () => {
      mockGetFolderTree.mockResolvedValue([]);
      mockGetAllFolders.mockResolvedValue([]);

      const { result } = renderHook(() => useVirtualFolders());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshFolders).toBe("function");
    });
  });
});
