import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createShareLink,
  getShareLinksForResource,
  getShareLinkByToken,
  updateShareLink,
  deleteShareLink,
  CreateShareLinkParams,
  UpdateShareLinkParams,
} from "../share.repository";

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

describe("share.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("createShareLink", () => {
    it("should make POST request to /shares with body", async () => {
      const mockResponse = {
        data: {
          id: 1,
          token: "abc123",
          resource_type: "model",
          resource_id: 1,
          settings: {
            shareAllFields: false,
            allowDataExport: true,
            allowViewersToOpenRecords: false,
            displayToolbar: true,
          },
          is_enabled: true,
          expires_at: "2025-12-31T23:59:59Z",
          created_at: "2024-01-01T00:00:00Z",
        },
        status: 201,
        statusText: "Created",
      };

      const params: CreateShareLinkParams = {
        resource_type: "model",
        resource_id: 1,
        settings: {
          shareAllFields: false,
          allowDataExport: true,
          allowViewersToOpenRecords: false,
          displayToolbar: true,
        },
        expires_at: new Date("2025-12-31T23:59:59Z"),
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createShareLink(params);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/shares", params);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      const params: CreateShareLinkParams = {
        resource_type: "model",
        resource_id: 1,
      };

      await expect(createShareLink(params)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      const params: CreateShareLinkParams = {
        resource_type: "policy",
        resource_id: 2,
      };

      await expect(createShareLink(params)).rejects.toThrow("Network timeout");
    });
  });

  describe("getShareLinksForResource", () => {
    it("should make GET request to /shares/:resourceType/:resourceId", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            token: "abc123",
            resource_type: "model",
            resource_id: 1,
            is_enabled: true,
            expires_at: "2025-12-31T23:59:59Z",
          },
          {
            id: 2,
            token: "def456",
            resource_type: "model",
            resource_id: 1,
            is_enabled: false,
            expires_at: null,
          },
        ],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getShareLinksForResource("model", 1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shares/model/1");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Resource Not Found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getShareLinksForResource("model", 999)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getShareLinksForResource("policy", 1)).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("getShareLinkByToken", () => {
    it("should make GET request to /shares/token/:token", async () => {
      const mockResponse = {
        data: {
          id: 1,
          token: "abc123xyz",
          resource_type: "model",
          resource_id: 1,
          settings: {
            shareAllFields: true,
            allowDataExport: true,
            allowViewersToOpenRecords: true,
            displayToolbar: true,
          },
          is_enabled: true,
          expires_at: "2025-12-31T23:59:59Z",
          created_at: "2024-01-01T00:00:00Z",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getShareLinkByToken("abc123xyz");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shares/token/abc123xyz");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Share link not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getShareLinkByToken("invalid-token")).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getShareLinkByToken("abc123")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("updateShareLink", () => {
    it("should make PATCH request to /shares/:id with body", async () => {
      const mockResponse = {
        data: {
          id: 1,
          token: "abc123",
          resource_type: "model",
          resource_id: 1,
          settings: {
            shareAllFields: true,
            allowDataExport: false,
            allowViewersToOpenRecords: false,
            displayToolbar: false,
          },
          is_enabled: false,
          expires_at: "2025-12-31T23:59:59Z",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        },
        status: 200,
        statusText: "OK",
      };

      const params: UpdateShareLinkParams = {
        settings: {
          shareAllFields: true,
          allowDataExport: false,
          allowViewersToOpenRecords: false,
          displayToolbar: false,
        },
        is_enabled: false,
        expires_at: new Date("2025-12-31T23:59:59Z"),
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateShareLink(1, params);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/shares/1", params);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Share link not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      const params: UpdateShareLinkParams = {
        is_enabled: true,
      };

      await expect(updateShareLink(999, params)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      const params: UpdateShareLinkParams = {
        is_enabled: false,
      };

      await expect(updateShareLink(1, params)).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("deleteShareLink", () => {
    it("should make DELETE request to /shares/:id", async () => {
      const mockResponse = {
        data: {
          message: "Share link deleted successfully",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteShareLink(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/shares/1");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Share link not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteShareLink(999)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteShareLink(1)).rejects.toThrow("Network timeout");
    });
  });
});
