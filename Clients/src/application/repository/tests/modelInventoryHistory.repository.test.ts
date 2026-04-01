import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createHistorySnapshot,
  getCurrentParameterCounts,
  getModelInventoryTimeseries,
} from "../modelInventoryHistory.repository";

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

describe("Test Model Inventory History Repository", () => {
  // ─── getModelInventoryTimeseries ───────────────────────────────────────────

  describe("getModelInventoryTimeseries", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request with only the required parameter", async () => {
      const mockResponse = {
        data: { timeseries: [] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getModelInventoryTimeseries("status");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/modelInventoryHistory/timeseries",
        {
          parameter: "status",
          startDate: undefined,
          endDate: undefined,
          intervalHours: undefined,
          timeframe: undefined,
        },
      );
    });

    it("should make a GET request with all optional params when provided", async () => {
      const mockResponse = {
        data: { timeseries: [] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getModelInventoryTimeseries(
        "security_assessment",
        "7days",
        "2026-01-01",
        "2026-03-01",
        12,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/modelInventoryHistory/timeseries",
        {
          parameter: "security_assessment",
          startDate: "2026-01-01",
          endDate: "2026-03-01",
          intervalHours: 12,
          timeframe: "7days",
        },
      );
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = {
        data: { timeseries: [{ date: "2026-03-01", count: 5 }] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getModelInventoryTimeseries("status");

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getModelInventoryTimeseries("status")).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getModelInventoryTimeseries("status")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── getCurrentParameterCounts ─────────────────────────────────────────────

  describe("getCurrentParameterCounts", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL with the parameter", async () => {
      const mockResponse = {
        data: { counts: { active: 3, inactive: 1 } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getCurrentParameterCounts("status");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/api/modelInventoryHistory/current-counts",
        { params: { parameter: "status" } },
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockCounts = { active: 3, inactive: 1 };
      const mockResponse = { data: mockCounts, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getCurrentParameterCounts("status");

      expect(result).toEqual(mockCounts);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getCurrentParameterCounts("status")).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(getCurrentParameterCounts("status")).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ─── createHistorySnapshot ─────────────────────────────────────────────────

  describe("createHistorySnapshot", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request with parameter and description when both are provided", async () => {
      const mockResponse = {
        data: { id: 1, parameter: "status" },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createHistorySnapshot("status", "Manual snapshot");

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/api/modelInventoryHistory/snapshot",
        { parameter: "status", description: "Manual snapshot" },
      );
    });

    it("should make a POST request with only the parameter when description is omitted", async () => {
      const mockResponse = {
        data: { id: 1, parameter: "status" },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createHistorySnapshot("status");

      expect(apiServices.post).toHaveBeenCalledWith(
        "/api/modelInventoryHistory/snapshot",
        { parameter: "status", description: undefined },
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockSnapshot = {
        id: 1,
        parameter: "status",
        created_at: "2026-03-05T00:00:00Z",
      };
      const mockResponse = {
        data: mockSnapshot,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createHistorySnapshot("status", "Snapshot desc");

      expect(result).toEqual(mockSnapshot);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createHistorySnapshot("status")).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(createHistorySnapshot("status")).rejects.toThrow(
        "Network timeout",
      );
    });
  });
});
