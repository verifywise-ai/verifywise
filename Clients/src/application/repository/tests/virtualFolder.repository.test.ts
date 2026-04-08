import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { APIError } from "../../tools/error";
import {
  getAllFolders,
  getFolderTree,
  getFolderById,
  getFolderPath,
  createFolder,
  updateFolder,
  deleteFolder,
  getFilesInFolder,
  getUncategorizedFiles,
  assignFilesToFolder,
  removeFileFromFolder,
  getFileFolders,
  updateFileFolders,
} from "../virtualFolder.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("virtualFolder.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getAllFolders", () => {
    it("should make GET request to /virtual-folders", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "Folder 1" }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllFolders();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/virtual-folders");
      expect(result).toEqual([{ id: 1, name: "Folder 1" }]);
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllFolders()).rejects.toThrow(APIError);
      await expect(getAllFolders()).rejects.toThrow("Failed to fetch folders");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAllFolders()).rejects.toThrow("Failed to fetch folders");
    });
  });

  describe("getFolderTree", () => {
    it("should make GET request to /virtual-folders/tree", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "Root", children: [] }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getFolderTree();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/virtual-folders/tree");
      expect(result).toEqual([{ id: 1, name: "Root", children: [] }]);
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getFolderTree()).rejects.toThrow(APIError);
      await expect(getFolderTree()).rejects.toThrow("Failed to fetch folder tree");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getFolderTree()).rejects.toThrow("Failed to fetch folder tree");
    });
  });

  describe("getFolderById", () => {
    it("should make GET request to /virtual-folders/:id", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: { id: 1, name: "Folder 1", file_count: 5 },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getFolderById(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/virtual-folders/1");
      expect(result).toEqual({ id: 1, name: "Folder 1", file_count: 5 });
    });

    it("should throw APIError with folder ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Folder not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getFolderById(999)).rejects.toThrow(APIError);
      await expect(getFolderById(999)).rejects.toThrow("Failed to fetch folder with ID 999");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getFolderById(1)).rejects.toThrow("Failed to fetch folder with ID 1");
    });
  });

  describe("getFolderPath", () => {
    it("should make GET request to /virtual-folders/:id/path", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "Root" }, { id: 2, name: "Child" }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getFolderPath(2);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/virtual-folders/2/path");
      expect(result).toEqual([{ id: 1, name: "Root" }, { id: 2, name: "Child" }]);
    });

    it("should throw APIError with folder ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Folder not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getFolderPath(999)).rejects.toThrow(APIError);
      await expect(getFolderPath(999)).rejects.toThrow("Failed to fetch folder path for ID 999");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getFolderPath(1)).rejects.toThrow("Failed to fetch folder path for ID 1");
    });
  });

  describe("createFolder", () => {
    it("should make POST request to /virtual-folders with input", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: { id: 1, name: "New Folder", parent_id: null },
        },
        status: 201,
        statusText: "Created",
      };

      const input = { name: "New Folder", parent_id: null };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createFolder(input);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/virtual-folders", input);
      expect(result).toEqual({ id: 1, name: "New Folder", parent_id: null });
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid folder data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createFolder({ name: "" })).rejects.toThrow(APIError);
      await expect(createFolder({ name: "" })).rejects.toThrow("Failed to create folder");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(createFolder({ name: "Test" })).rejects.toThrow("Failed to create folder");
    });
  });

  describe("updateFolder", () => {
    it("should make PATCH request to /virtual-folders/:id with input", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: { id: 1, name: "Updated Folder" },
        },
        status: 200,
        statusText: "OK",
      };

      const input = { name: "Updated Folder" };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateFolder(1, input);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/virtual-folders/1", input);
      expect(result).toEqual({ id: 1, name: "Updated Folder" });
    });

    it("should throw APIError with folder ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Folder not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateFolder(999, { name: "Test" })).rejects.toThrow(APIError);
      await expect(updateFolder(999, { name: "Test" })).rejects.toThrow("Failed to update folder with ID 999");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(updateFolder(1, { name: "Test" })).rejects.toThrow("Failed to update folder with ID 1");
    });
  });

  describe("deleteFolder", () => {
    it("should make DELETE request to /virtual-folders/:id", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: null,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteFolder(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/virtual-folders/1");
    });

    it("should throw APIError with folder ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Folder not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteFolder(999)).rejects.toThrow(APIError);
      await expect(deleteFolder(999)).rejects.toThrow("Failed to delete folder with ID 999");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteFolder(1)).rejects.toThrow("Failed to delete folder with ID 1");
    });
  });

  describe("getFilesInFolder", () => {
    it("should make GET request to /virtual-folders/:folderId/files", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "File 1" }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getFilesInFolder(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/virtual-folders/1/files");
      expect(result).toEqual([{ id: 1, name: "File 1" }]);
    });

    it("should throw APIError with folder ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getFilesInFolder(1)).rejects.toThrow(APIError);
      await expect(getFilesInFolder(1)).rejects.toThrow("Failed to fetch files in folder 1");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getFilesInFolder(1)).rejects.toThrow("Failed to fetch files in folder 1");
    });
  });

  describe("getUncategorizedFiles", () => {
    it("should make GET request to /virtual-folders/uncategorized", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "Uncategorized File" }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUncategorizedFiles();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/virtual-folders/uncategorized");
      expect(result).toEqual([{ id: 1, name: "Uncategorized File" }]);
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUncategorizedFiles()).rejects.toThrow(APIError);
      await expect(getUncategorizedFiles()).rejects.toThrow("Failed to fetch uncategorized files");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUncategorizedFiles()).rejects.toThrow("Failed to fetch uncategorized files");
    });
  });

  describe("assignFilesToFolder", () => {
    it("should make POST request to /virtual-folders/:folderId/files with file IDs", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: { assigned: 3 },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await assignFilesToFolder(1, [1, 2, 3]);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/virtual-folders/1/files", { file_ids: [1, 2, 3] });
      expect(result).toEqual({ assigned: 3 });
    });

    it("should throw APIError with folder ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid file IDs" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(assignFilesToFolder(1, [])).rejects.toThrow(APIError);
      await expect(assignFilesToFolder(1, [])).rejects.toThrow("Failed to assign files to folder 1");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(assignFilesToFolder(1, [1, 2])).rejects.toThrow("Failed to assign files to folder 1");
    });
  });

  describe("removeFileFromFolder", () => {
    it("should make DELETE request to /virtual-folders/:folderId/files/:fileId", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: { removed: true },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await removeFileFromFolder(1, 5);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/virtual-folders/1/files/5");
      expect(result).toEqual({ removed: true });
    });

    it("should throw APIError with folder and file IDs in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "File not found in folder" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(removeFileFromFolder(1, 999)).rejects.toThrow(APIError);
      await expect(removeFileFromFolder(1, 999)).rejects.toThrow("Failed to remove file 999 from folder 1");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(removeFileFromFolder(1, 5)).rejects.toThrow("Failed to remove file 5 from folder 1");
    });
  });

  describe("getFileFolders", () => {
    it("should make GET request to /files/:fileId/folders", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "Folder 1" }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getFileFolders(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/files/1/folders");
      expect(result).toEqual([{ id: 1, name: "Folder 1" }]);
    });

    it("should throw APIError with file ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "File not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getFileFolders(999)).rejects.toThrow(APIError);
      await expect(getFileFolders(999)).rejects.toThrow("Failed to fetch folders for file 999");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getFileFolders(1)).rejects.toThrow("Failed to fetch folders for file 1");
    });
  });

  describe("updateFileFolders", () => {
    it("should make PATCH request to /files/:fileId/folders with folder IDs", async () => {
      const mockResponse = {
        data: {
          message: "Success",
          data: [{ id: 1, name: "Folder 1" }],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateFileFolders(1, [1, 2, 3]);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/files/1/folders", { folder_ids: [1, 2, 3] });
      expect(result).toEqual([{ id: 1, name: "Folder 1" }]);
    });

    it("should throw APIError with file ID in message when API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid folder IDs" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateFileFolders(1, [])).rejects.toThrow(APIError);
      await expect(updateFileFolders(1, [])).rejects.toThrow("Failed to update folders for file 1");
    });

    it("should throw error without response for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(updateFileFolders(1, [1, 2])).rejects.toThrow("Failed to update folders for file 1");
    });
  });
});
