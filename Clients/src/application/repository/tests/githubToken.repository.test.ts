/**
 * @fileoverview Tests for GitHub Token Repository
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  deleteGitHubToken,
  getGitHubTokenStatus,
  GitHubTokenStatus,
  GitHubTokenTestResult,
  saveGitHubToken,
  testGitHubToken,
} from "../githubToken.repository";

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

const BASE_URL = "/integrations/github";

describe("Test GitHub Token Repository", () => {
  describe("getGitHubTokenStatus", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockTokenStatus: GitHubTokenStatus = {
      configured: true,
      token_name: "my-token",
      last_used_at: "2026-03-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    };

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getGitHubTokenStatus();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/token`, {
        signal: undefined,
      });
    });

    it("should return the token status data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getGitHubTokenStatus();

      expect(result).toEqual(mockTokenStatus);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getGitHubTokenStatus(controller.signal);

      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/token`, {
        signal: controller.signal,
      });
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: "Unauthorized" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getGitHubTokenStatus()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getGitHubTokenStatus()).rejects.toThrow("Network timeout");
    });
  });

  describe("saveGitHubToken", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockTokenStatus: GitHubTokenStatus = {
      configured: true,
      token_name: "my-token",
      created_at: "2026-03-01T00:00:00Z",
    };

    it("should make a POST request with token and token_name", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await saveGitHubToken("ghp_mytoken123", "my-token");

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/token`,
        { token: "ghp_mytoken123", token_name: "my-token" },
        { signal: undefined },
      );
    });

    it("should make a POST request with only token when tokenName is omitted", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await saveGitHubToken("ghp_mytoken123");

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/token`,
        { token: "ghp_mytoken123", token_name: undefined },
        { signal: undefined },
      );
    });

    it("should return the token status data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await saveGitHubToken("ghp_mytoken123", "my-token");

      expect(result).toEqual(mockTokenStatus);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockTokenStatus },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await saveGitHubToken("ghp_mytoken123", "my-token", controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/token`,
        { token: "ghp_mytoken123", token_name: "my-token" },
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: {
          status: 422,
          data: { message: "Invalid token format" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(saveGitHubToken("invalid-token")).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(saveGitHubToken("ghp_mytoken123")).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("deleteGitHubToken", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a DELETE request to the correct URL", async () => {
      const mockResponse = {
        data: { data: { message: "Token deleted successfully" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteGitHubToken();

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith(`${BASE_URL}/token`, {
        signal: undefined,
      });
    });

    it("should return the message on successful API call", async () => {
      const mockResponse = {
        data: { data: { message: "Token deleted successfully" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteGitHubToken();

      expect(result).toEqual({ message: "Token deleted successfully" });
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: { message: "Token deleted successfully" } },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteGitHubToken(controller.signal);

      expect(apiServices.delete).toHaveBeenCalledWith(`${BASE_URL}/token`, {
        signal: controller.signal,
      });
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Token not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteGitHubToken()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteGitHubToken()).rejects.toThrow("Network timeout");
    });
  });

  describe("testGitHubToken", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockTestResult: GitHubTokenTestResult = {
      valid: true,
      scopes: ["repo", "read:org"],
      rate_limit: {
        limit: 5000,
        remaining: 4999,
        reset: "2026-03-05T01:00:00Z",
      },
    };

    it("should make a POST request to the test endpoint with the token", async () => {
      const mockResponse = {
        data: { data: mockTestResult },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await testGitHubToken("ghp_mytoken123");

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/token/test`,
        { token: "ghp_mytoken123" },
        { signal: undefined },
      );
    });

    it("should return the test result data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockTestResult },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await testGitHubToken("ghp_mytoken123");

      expect(result).toEqual(mockTestResult);
    });

    it("should return invalid result when token is invalid", async () => {
      const invalidResult: GitHubTokenTestResult = {
        valid: false,
        error: "Bad credentials",
      };
      const mockResponse = {
        data: { data: invalidResult },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await testGitHubToken("ghp_invalidtoken");

      expect(result).toEqual(invalidResult);
      expect(result.valid).toBe(false);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockTestResult },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await testGitHubToken("ghp_mytoken123", controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/token/test`,
        { token: "ghp_mytoken123" },
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(testGitHubToken("ghp_mytoken123")).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(testGitHubToken("ghp_mytoken123")).rejects.toThrow(
        "Connection refused",
      );
    });
  });
});
