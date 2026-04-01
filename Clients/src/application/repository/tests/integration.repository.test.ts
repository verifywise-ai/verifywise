import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  configureMlflow,
  getMlflowConfig,
  getMlflowModels,
  getMlflowSyncStatus,
  testMlflowConnection,
  triggerMlflowSync,
} from "../integration.repository";

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

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const mockMlflowConfig = {
  configured: true,
  config: {
    lastTestStatus: "success" as const,
    lastTestedAt: "2026-03-01T00:00:00Z",
    tracking_uri: "http://mlflow.example.com",
  },
};

const mockSyncStatus = {
  success: true,
  data: {
    configured: true,
    lastSyncedAt: "2026-03-01T00:00:00Z",
    lastSyncStatus: "success" as const,
    lastSyncMessage: null,
    lastTestStatus: "success" as const,
    lastTestedAt: "2026-03-01T00:00:00Z",
    lastTestMessage: null,
    lastSuccessfulTestAt: "2026-03-01T00:00:00Z",
    lastFailedTestAt: null,
    lastFailedTestMessage: null,
  },
};

const mockModels = {
  configured: true,
  connected: true,
  models: [{ name: "my-model", version: "1" }],
};

// ─── getMlflowConfig ──────────────────────────────────────────────────────────

describe("Test Integration Repository", () => {
  describe("getMlflowConfig", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = {
        data: mockMlflowConfig,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getMlflowConfig();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/integrations/mlflow/config",
        {
          signal: undefined,
        },
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: mockMlflowConfig,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getMlflowConfig();

      expect(result).toEqual(mockMlflowConfig);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: mockMlflowConfig,
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getMlflowConfig({ signal: controller.signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/integrations/mlflow/config",
        {
          signal: controller.signal,
        },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getMlflowConfig()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getMlflowConfig()).rejects.toThrow("Network timeout");
    });
  });

  // ─── getMlflowSyncStatus ───────────────────────────────────────────────────

  describe("getMlflowSyncStatus", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = {
        data: mockSyncStatus,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getMlflowSyncStatus();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/integrations/mlflow/sync-status",
        {
          signal: undefined,
        },
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: mockSyncStatus,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getMlflowSyncStatus();

      expect(result).toEqual(mockSyncStatus);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: mockSyncStatus,
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getMlflowSyncStatus({ signal: controller.signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/integrations/mlflow/sync-status",
        {
          signal: controller.signal,
        },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 503, data: { message: "Service Unavailable" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getMlflowSyncStatus()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(getMlflowSyncStatus()).rejects.toThrow("Connection refused");
    });
  });

  // ─── getMlflowModels ───────────────────────────────────────────────────────

  describe("getMlflowModels", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = { data: mockModels, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getMlflowModels();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/integrations/mlflow/models",
        {
          signal: undefined,
        },
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = { data: mockModels, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getMlflowModels();

      expect(result).toEqual(mockModels);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = { data: mockModels, status: 200, statusText: "OK" };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getMlflowModels({ signal: controller.signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/integrations/mlflow/models",
        {
          signal: controller.signal,
        },
      );
    });

    it("should return unconfigured state when MLflow is not configured", async () => {
      const unconfiguredResponse = { configured: false, models: [] };
      const mockResponse = {
        data: unconfiguredResponse,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getMlflowModels();

      expect(result).toEqual(unconfiguredResponse);
      expect(result.configured).toBe(false);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getMlflowModels()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getMlflowModels()).rejects.toThrow("Network timeout");
    });
  });

  // ─── testMlflowConnection ─────────────────────────────────────────────────

  describe("testMlflowConnection", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const testData = {
      trackingServerUrl: "http://mlflow.example.com",
      authMethod: "none",
      timeout: 30,
      verifySsl: true,
    };

    it("should make a POST request to the test endpoint with the provided data", async () => {
      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await testMlflowConnection(testData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/integrations/mlflow/test",
        testData,
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: { success: true, message: "Connection successful" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await testMlflowConnection(testData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should return a failed result when the connection test fails", async () => {
      const failedResponse = { success: false, error: "Connection refused" };
      const mockResponse = {
        data: failedResponse,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await testMlflowConnection(testData);

      expect(result).toEqual(failedResponse);
      expect(result.success).toBe(false);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(testMlflowConnection(testData)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(testMlflowConnection(testData)).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ─── configureMlflow ──────────────────────────────────────────────────────

  describe("configureMlflow", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const configData = { tracking_uri: "http://mlflow.example.com" };

    it("should make a POST request to the configure endpoint with the provided data", async () => {
      const mockResponse = {
        data: { configured: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await configureMlflow(configData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/integrations/mlflow/configure",
        configData,
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: { configured: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await configureMlflow(configData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Invalid tracking URI" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(configureMlflow(configData)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(configureMlflow(configData)).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── triggerMlflowSync ────────────────────────────────────────────────────

  describe("triggerMlflowSync", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the sync endpoint with an empty body", async () => {
      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await triggerMlflowSync();

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/integrations/mlflow/sync",
        {},
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: { success: true, message: "Sync started" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await triggerMlflowSync();

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 503, data: { message: "MLflow not reachable" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(triggerMlflowSync()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(triggerMlflowSync()).rejects.toThrow("Connection refused");
    });
  });
});
