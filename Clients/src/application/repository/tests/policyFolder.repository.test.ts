import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomAxios from "../../../infrastructure/api/customAxios";
import {
  getPolicyFolders,
  getPolicyIdsInFolder,
  updatePolicyFolders,
} from "../policyFolder.repository";

vi.mock("../../../infrastructure/api/customAxios", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockFolders = [
  {
    id: 1,
    name: "General Policies",
    description: "General policy folder",
    parentId: null,
    createdAt: "2026-03-12T00:00:00Z",
    updatedAt: "2026-03-12T00:00:00Z",
  },
  {
    id: 2,
    name: "Security Policies",
    description: "Security-related policies",
    parentId: 1,
    createdAt: "2026-03-11T00:00:00Z",
    updatedAt: "2026-03-11T00:00:00Z",
  },
];

const mockPolicyIds = [1, 2, 3, 5, 8];

describe("policyFolder.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getPolicyFolders", () => {
    it("should fetch policy folders by policy ID", async () => {
      const response = { data: { data: mockFolders } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyFolders(1);

      expect(CustomAxios.get).toHaveBeenCalledWith("/policies/1/folders");
      expect(result).toEqual(mockFolders);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when policy has no folders", async () => {
      const response = { data: { data: [] } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyFolders(1);

      expect(CustomAxios.get).toHaveBeenCalledWith("/policies/1/folders");
      expect(result).toEqual([]);
    });

    it("should handle different policy IDs", async () => {
      const response = { data: { data: mockFolders } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      await getPolicyFolders(15);

      expect(CustomAxios.get).toHaveBeenCalledWith("/policies/15/folders");
    });

    it("should handle API errors when fetching folders", async () => {
      const error = new Error("Network error");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyFolders(1)).rejects.toThrow("Network error");
    });

    it("should throw error with 404 status when policy not found", async () => {
      const error = new Error("Policy not found");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyFolders(999)).rejects.toThrow("Policy not found");
    });

    it("should throw error with 403 forbidden", async () => {
      const error = new Error("Forbidden");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyFolders(1)).rejects.toThrow("Forbidden");
    });

    it("should throw error with 500 server error", async () => {
      const error = new Error("Internal Server Error");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyFolders(1)).rejects.toThrow(
        "Internal Server Error",
      );
    });

    it("should return folders with nested structure", async () => {
      const nestedFolders = [
        {
          id: 1,
          name: "Parent Folder",
          parent_id: null,
        },
        {
          id: 2,
          name: "Child Folder",
          parent_id: 1,
        },
        {
          id: 3,
          name: "Grandchild Folder",
          parent_id: 2,
        },
      ];
      const response = { data: { data: nestedFolders } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyFolders(1);

      expect(result).toEqual(nestedFolders);
      expect(result[0].parent_id).toBeNull();
      expect(result[1].parent_id).toBe(1);
      expect(result[2].parent_id).toBe(2);
    });
  });

  describe("getPolicyIdsInFolder", () => {
    it("should fetch policy IDs in folder", async () => {
      const response = { data: { data: mockPolicyIds } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyIdsInFolder(1);

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/policies/folders/1/policies",
      );
      expect(result).toEqual(mockPolicyIds);
      expect(result).toHaveLength(5);
    });

    it("should return empty array when folder has no policies", async () => {
      const response = { data: { data: [] } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyIdsInFolder(1);

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/policies/folders/1/policies",
      );
      expect(result).toEqual([]);
    });

    it("should handle different folder IDs", async () => {
      const response = { data: { data: mockPolicyIds } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      await getPolicyIdsInFolder(25);

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/policies/folders/25/policies",
      );
    });

    it("should handle single policy in folder", async () => {
      const response = { data: { data: [42] } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyIdsInFolder(1);

      expect(result).toEqual([42]);
      expect(result).toHaveLength(1);
    });

    it("should handle API errors when fetching policy IDs", async () => {
      const error = new Error("Network error");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyIdsInFolder(1)).rejects.toThrow("Network error");
    });

    it("should throw error with 404 status when folder not found", async () => {
      const error = new Error("Folder not found");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyIdsInFolder(999)).rejects.toThrow(
        "Folder not found",
      );
    });

    it("should throw error with 403 forbidden", async () => {
      const error = new Error("Forbidden");
      vi.mocked(CustomAxios.get).mockRejectedValue(error);

      await expect(getPolicyIdsInFolder(1)).rejects.toThrow("Forbidden");
    });

    it("should handle multiple policy IDs in folder", async () => {
      const multiplePolicies = [10, 20, 30, 40, 50, 60, 70];
      const response = { data: { data: multiplePolicies } };
      vi.mocked(CustomAxios.get).mockResolvedValue(response as any);

      const result = await getPolicyIdsInFolder(1);

      expect(result).toEqual(multiplePolicies);
      expect(result.length).toBe(7);
    });
  });

  describe("updatePolicyFolders", () => {
    it("should update policy folders successfully", async () => {
      const updatedFolders = [{ ...mockFolders[0] }, { ...mockFolders[1] }];
      const response = { data: { data: updatedFolders } };
      vi.mocked(CustomAxios.patch).mockResolvedValue(response as any);

      const result = await updatePolicyFolders(1, [1, 2]);

      expect(CustomAxios.patch).toHaveBeenCalledWith("/policies/1/folders", {
        folder_ids: [1, 2],
      });
      expect(result).toEqual(updatedFolders);
    });

    it("should handle empty folder IDs array", async () => {
      const response = { data: { data: [] } };
      vi.mocked(CustomAxios.patch).mockResolvedValue(response as any);

      const result = await updatePolicyFolders(1, []);

      expect(CustomAxios.patch).toHaveBeenCalledWith("/policies/1/folders", {
        folder_ids: [],
      });
      expect(result).toEqual([]);
    });

    it("should handle single folder assignment", async () => {
      const response = { data: { data: [mockFolders[0]] } };
      vi.mocked(CustomAxios.patch).mockResolvedValue(response as any);

      const result = await updatePolicyFolders(1, [1]);

      expect(CustomAxios.patch).toHaveBeenCalledWith("/policies/1/folders", {
        folder_ids: [1],
      });
      expect(result).toHaveLength(1);
    });

    it("should handle multiple folder assignments", async () => {
      const response = { data: { data: mockFolders } };
      vi.mocked(CustomAxios.patch).mockResolvedValue(response as any);

      const result = await updatePolicyFolders(1, [1, 2, 3]);

      expect(CustomAxios.patch).toHaveBeenCalledWith("/policies/1/folders", {
        folder_ids: [1, 2, 3],
      });
      expect(result).toEqual(mockFolders);
    });

    it("should handle different policy IDs in update request", async () => {
      const response = { data: { data: mockFolders } };
      vi.mocked(CustomAxios.patch).mockResolvedValue(response as any);

      await updatePolicyFolders(15, [1, 2]);

      expect(CustomAxios.patch).toHaveBeenCalledWith("/policies/15/folders", {
        folder_ids: [1, 2],
      });
    });

    it("should handle API errors when updating folders", async () => {
      const error = new Error("Update failed");
      vi.mocked(CustomAxios.patch).mockRejectedValue(error);

      await expect(updatePolicyFolders(1, [1, 2])).rejects.toThrow(
        "Update failed",
      );
    });

    it("should throw error with 404 status when policy not found", async () => {
      const error = new Error("Policy not found");
      vi.mocked(CustomAxios.patch).mockRejectedValue(error);

      await expect(updatePolicyFolders(999, [1])).rejects.toThrow(
        "Policy not found",
      );
    });

    it("should throw error with 403 forbidden on update", async () => {
      const error = new Error("Forbidden");
      vi.mocked(CustomAxios.patch).mockRejectedValue(error);

      await expect(updatePolicyFolders(1, [1, 2])).rejects.toThrow("Forbidden");
    });

    it("should throw error with 400 bad request for invalid folder IDs", async () => {
      const error = new Error("Invalid folder IDs");
      vi.mocked(CustomAxios.patch).mockRejectedValue(error);

      await expect(updatePolicyFolders(1, [999, 1000])).rejects.toThrow(
        "Invalid folder IDs",
      );
    });

    it("should throw error with 409 conflict", async () => {
      const error = new Error("Conflict");
      vi.mocked(CustomAxios.patch).mockRejectedValue(error);

      await expect(updatePolicyFolders(1, [1, 2])).rejects.toThrow("Conflict");
    });

    it("should throw error with 500 server error on update", async () => {
      const error = new Error("Internal Server Error");
      vi.mocked(CustomAxios.patch).mockRejectedValue(error);

      await expect(updatePolicyFolders(1, [1, 2])).rejects.toThrow(
        "Internal Server Error",
      );
    });
  });
});
