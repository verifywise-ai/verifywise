import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getAllVendorRisks,
  getVendorRisksByProjectId,
  getVendorRisksByVendorId,
  getVendorRiskById,
  createVendorRisk,
  updateVendorRisk,
  deleteVendorRisk,
} from "../vendorRisk.repository";

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

describe("vendorRisk.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getAllVendorRisks", () => {
    it("should make GET request to /vendorRisks/all with default filter", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Risk 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllVendorRisks({});

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendorRisks/all?filter=active", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with custom filter", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Risk 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllVendorRisks({ filter: "deleted" });

      expect(apiServices.get).toHaveBeenCalledWith("/vendorRisks/all?filter=deleted", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllVendorRisks({})).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAllVendorRisks({})).rejects.toThrow("Network timeout");
    });
  });

  describe("getVendorRisksByProjectId", () => {
    it("should make GET request to /vendorRisks/by-projid/:projectId with default filter", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Risk 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getVendorRisksByProjectId({ projectId: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendorRisks/by-projid/1?filter=active", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with custom filter", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Risk 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getVendorRisksByProjectId({ projectId: 1, filter: "all" });

      expect(apiServices.get).toHaveBeenCalledWith("/vendorRisks/by-projid/1?filter=all", {
        signal: undefined,
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

      await expect(getVendorRisksByProjectId({ projectId: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getVendorRisksByProjectId({ projectId: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("getVendorRisksByVendorId", () => {
    it("should make GET request to /vendorRisks/by-vendorid/:vendorId with default filter", async () => {
      const mockResponse = {
        data: [{ id: 1, name: "Risk 1" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getVendorRisksByVendorId({ vendorId: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendorRisks/by-vendorid/1?filter=active", {
        signal: undefined,
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

      await expect(getVendorRisksByVendorId({ vendorId: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getVendorRisksByVendorId({ vendorId: 1 })).rejects.toThrow("Network timeout");
    });
  });

  describe("getVendorRiskById", () => {
    it("should make GET request to /vendorRisks/:id", async () => {
      const mockResponse = {
        data: { id: 1, name: "Risk 1" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getVendorRiskById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/vendorRisks/1", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Risk not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getVendorRiskById({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getVendorRiskById({ id: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("createVendorRisk", () => {
    it("should make POST request to /vendorRisks with body", async () => {
      const mockResponse = {
        data: { id: 1, name: "New Risk" },
        status: 201,
        statusText: "Created",
      };

      const body = { name: "New Risk", description: "Test" };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createVendorRisk({ body });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/vendorRisks", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid risk data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createVendorRisk({ body: { name: "" } })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(createVendorRisk({ body: { name: "Test" } })).rejects.toThrow("Network timeout");
    });
  });

  describe("updateVendorRisk", () => {
    it("should make PATCH request to /vendorRisks/:id with body", async () => {
      const mockResponse = {
        data: { id: 1, name: "Updated Risk" },
        status: 200,
        statusText: "OK",
      };

      const body = { name: "Updated Risk" };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateVendorRisk({ id: 1, body });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/vendorRisks/1", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Risk not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateVendorRisk({ id: 999, body: { name: "Test" } })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(updateVendorRisk({ id: 1, body: { name: "Test" } })).rejects.toThrow("Connection refused");
    });
  });

  describe("deleteVendorRisk", () => {
    it("should make DELETE request to /vendorRisks/:id", async () => {
      const mockResponse = {
        data: { message: "Risk deleted successfully" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteVendorRisk({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/vendorRisks/1");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Risk not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteVendorRisk({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteVendorRisk({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });
});
