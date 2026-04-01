import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getAllVendors,
  getVendorsByProjectId,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
} from "../vendorsProjects.repository";

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

describe("vendorsProjects.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getAllVendors", () => {
    it("should make GET request to /vendors with default responseType", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Vendor 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllVendors({});

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendors", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should pass signal and responseType when provided", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Vendor 1" }],
        status: 200,
        statusText: "OK",
      };

      const signal = {} as AbortSignal;

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllVendors({ signal, responseType: "blob" });

      expect(apiServices.get).toHaveBeenCalledWith("/vendors", {
        signal,
        responseType: "blob",
      });
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllVendors({})).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAllVendors({})).rejects.toThrow("Network timeout");
    });
  });

  describe("getVendorsByProjectId", () => {
    it("should make GET request to /vendors/project-id/:projectId with default responseType", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Vendor 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getVendorsByProjectId({ projectId: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendors/project-id/1", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Project not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getVendorsByProjectId({ projectId: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getVendorsByProjectId({ projectId: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("getVendorById", () => {
    it("should make GET request to /vendors/:id with default responseType", async () => {
      const mockResponse = {
        data: { id: 1, name: "Vendor 1" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getVendorById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendors/1", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Vendor not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getVendorById({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getVendorById({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });

  describe("createVendor", () => {
    it("should make POST request to /vendors with body", async () => {
      const mockResponse = {
        data: { id: 1, name: "New Vendor" },
        status: 201,
        statusText: "Created",
      };

      const body = { name: "New Vendor", description: "Test" };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createVendor({ body });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/vendors", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid vendor data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createVendor({ body: { name: "" } })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(createVendor({ body: { name: "Test" } })).rejects.toThrow("Connection refused");
    });
  });

  describe("updateVendor", () => {
    it("should make PATCH request to /vendors/:id with body", async () => {
      const mockResponse = {
        data: { id: 1, name: "Updated Vendor" },
        status: 200,
        statusText: "OK",
      };

      const body = { name: "Updated Vendor" };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateVendor({ id: 1, body });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/vendors/1", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Vendor not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateVendor({ id: 999, body: { name: "Test" } })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(updateVendor({ id: 1, body: { name: "Test" } })).rejects.toThrow("Network timeout");
    });
  });

  describe("deleteVendor", () => {
    it("should make DELETE request to /vendors/:id", async () => {
      const mockResponse = {
        data: { message: "Vendor deleted successfully" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteVendor({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/vendors/1");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Vendor not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteVendor({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteVendor({ id: 1 })).rejects.toThrow("Connection refused");
    });
  });
});
