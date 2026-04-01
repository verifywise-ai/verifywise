import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getTaskEntityLinks,
  addTaskEntityLink,
  removeTaskEntityLink,
  ITaskEntityLink,
  EntityType,
} from "../taskEntityLink.repository";
import { APIError } from "../../tools/error";

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

describe("taskEntityLink.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getTaskEntityLinks", () => {
    it("should make GET request to /tasks/:taskId/entities", async () => {
      const mockData: ITaskEntityLink[] = [
        {
          id: 1,
          task_id: 1,
          entity_id: 100,
          entity_type: "vendor" as EntityType,
          entity_name: "Test Vendor",
        },
      ];

      const mockResponse = {
        data: {
          message: "Success",
          data: mockData,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTaskEntityLinks(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/tasks/1/entities");
      expect(result).toEqual(mockData);
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getTaskEntityLinks(999)).rejects.toThrow(APIError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getTaskEntityLinks(1)).rejects.toThrow("Failed to fetch task entity links");
    });
  });

  describe("addTaskEntityLink", () => {
    it("should make POST request to /tasks/:taskId/entities with link data", async () => {
      const mockData: ITaskEntityLink = {
        id: 1,
        task_id: 1,
        entity_id: 100,
        entity_type: "policy" as EntityType,
        entity_name: "Test Policy",
      };

      const mockResponse = {
        data: {
          message: "Created",
          data: mockData,
        },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await addTaskEntityLink(1, 100, "policy", "Test Policy");

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/tasks/1/entities", {
        entity_id: 100,
        entity_type: "policy",
        entity_name: "Test Policy",
      });
      expect(result).toEqual(mockData);
    });

    it("should make POST request without entity name", async () => {
      const mockData: ITaskEntityLink = {
        id: 2,
        task_id: 1,
        entity_id: 200,
        entity_type: "model" as EntityType,
      };

      const mockResponse = {
        data: {
          message: "Created",
          data: mockData,
        },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await addTaskEntityLink(1, 200, "model");

      expect(apiServices.post).toHaveBeenCalledWith("/tasks/1/entities", {
        entity_id: 200,
        entity_type: "model",
        entity_name: undefined,
      });
      expect(result).toEqual(mockData);
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        addTaskEntityLink(1, 100, "vendor", "Test"),
      ).rejects.toThrow(APIError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(addTaskEntityLink(1, 100, "vendor")).rejects.toThrow(
        "Failed to add entity link to task",
      );
    });
  });

  describe("removeTaskEntityLink", () => {
    it("should make DELETE request to /tasks/:taskId/entities/:linkId", async () => {
      const mockResponse = {
        data: {},
        status: 204,
        statusText: "No Content",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await removeTaskEntityLink(1, 10);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/tasks/1/entities/10");
    });

    it("should throw APIError when API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Link not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(removeTaskEntityLink(1, 999)).rejects.toThrow(APIError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(removeTaskEntityLink(1, 10)).rejects.toThrow("Failed to remove entity link from task");
    });
  });
});
