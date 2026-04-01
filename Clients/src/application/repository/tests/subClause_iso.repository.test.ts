import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  GetSubClausesById,
  ISO27001GetSubClauseByClauseId,
  ISO27001GetSubClauseById,
  UpdateSubClauseById,
} from "../subClause_iso.repository";

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

describe("subClause_iso.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("GetSubClausesById", () => {
    it("should make GET request with params and return response.data", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { subClauses: [{ id: 1, title: "1.1" }] };

      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetSubClausesById({ routeUrl, signal });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should make GET request with custom responseType", async () => {
      const routeUrl = "/iso27001/subClauses/export/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = "blob-content";

      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetSubClausesById({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockData);
    });

    it("should throw error with status and data if API call fails", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/1";
      const signal: AbortSignal = new AbortController().signal;

      const mockError = {
        response: {
          status: 404,
          data: { message: "Not Found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(GetSubClausesById({ routeUrl, signal })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/1";
      const signal: AbortSignal = new AbortController().signal;
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(GetSubClausesById({ routeUrl, signal })).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("UpdateSubClauseById", () => {
    it("should make PATCH request with FormData and multipart headers", async () => {
      const routeUrl = "/iso27001/subClauses/1";
      const body = new FormData();
      body.append("title", "Updated");
      const headers = { Authorization: "Bearer token" };

      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await UpdateSubClauseById({ routeUrl, body, headers });

      expect(apiServices.patch).toHaveBeenCalledWith(routeUrl, body, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: "Bearer token",
        },
      });
      expect(response).toEqual(mockResponse);
    });

    it("should make PATCH request without custom headers", async () => {
      const routeUrl = "/iso27001/subClauses/1";
      const body = new FormData();
      body.append("title", "Updated");

      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await UpdateSubClauseById({ routeUrl, body });

      expect(apiServices.patch).toHaveBeenCalledWith(routeUrl, body, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      expect(response).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const routeUrl = "/iso27001/subClauses/1";
      const body = new FormData();

      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid data" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(UpdateSubClauseById({ routeUrl, body })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const routeUrl = "/iso27001/subClauses/1";
      const body = new FormData();
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(UpdateSubClauseById({ routeUrl, body })).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("ISO27001GetSubClauseByClauseId", () => {
    it("should make GET request with params and return response.data", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/3";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { items: [{ id: 10 }] };

      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await ISO27001GetSubClauseByClauseId({
        routeUrl,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should make GET request with custom responseType", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/3/export";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = "blob-data";

      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await ISO27001GetSubClauseByClauseId({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockData);
    });

    it("should throw error with status and data if API call fails", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/3";
      const signal: AbortSignal = new AbortController().signal;

      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(
        ISO27001GetSubClauseByClauseId({ routeUrl, signal }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const routeUrl = "/iso27001/subClauses/byClauseId/3";
      const signal: AbortSignal = new AbortController().signal;
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(
        ISO27001GetSubClauseByClauseId({ routeUrl, signal }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("ISO27001GetSubClauseById", () => {
    it("should make GET request and return response.data", async () => {
      const routeUrl = "/iso27001/subClauses/5";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { id: 5, title: "5.1" };

      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await ISO27001GetSubClauseById({ routeUrl, signal });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should make GET request with custom responseType", async () => {
      const routeUrl = "/iso27001/subClauses/5";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = "blob-content";

      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await ISO27001GetSubClauseById({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockData);
    });

    it("should throw error with status and data if API call fails", async () => {
      const routeUrl = "/iso27001/subClauses/5";
      const signal: AbortSignal = new AbortController().signal;

      const mockError = {
        response: {
          status: 404,
          data: { message: "Subclause not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(ISO27001GetSubClauseById({ routeUrl, signal })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const routeUrl = "/iso27001/subClauses/5";
      const signal: AbortSignal = new AbortController().signal;
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(ISO27001GetSubClauseById({ routeUrl, signal })).rejects.toThrow(
        "Connection refused",
      );
    });
  });
});
