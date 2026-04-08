import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createApiToken,
  getApiTokens,
  deleteApiToken,
} from "../tokens.repository";

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

describe("tokens.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("createApiToken", () => {
    it("should make POST request to routeUrl with body", async () => {
      const mockResponse = {
        data: {
          token: "sk-test-123456",
          label: "Test Token",
        },
        status: 201,
        statusText: "Created",
      };

      const body = { label: "Test Token" };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createApiToken({
        routeUrl: "/api/tokens",
        body,
      });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/api/tokens", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid token data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createApiToken({
          routeUrl: "/api/tokens",
          body: { label: "" },
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createApiToken({
          routeUrl: "/api/tokens",
          body: { label: "Test" },
        }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("getApiTokens", () => {
    it("should make GET request to routeUrl", async () => {
      const mockResponse = {
        data: [
          { id: 1, token: "sk-test-***", label: "Token 1" },
          { id: 2, token: "sk-prod-***", label: "Token 2" },
        ],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getApiTokens({ routeUrl: "/api/tokens" });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/api/tokens");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Tokens not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getApiTokens({ routeUrl: "/api/tokens" })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getApiTokens({ routeUrl: "/api/tokens" })).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("deleteApiToken", () => {
    it("should make DELETE request to routeUrl", async () => {
      const mockResponse = {
        data: { message: "Token deleted" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteApiToken({ routeUrl: "/api/tokens/1" });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/api/tokens/1");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Token not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(
        deleteApiToken({ routeUrl: "/api/tokens/999" }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(
        deleteApiToken({ routeUrl: "/api/tokens/1" }),
      ).rejects.toThrow("Network timeout");
    });
  });
});
