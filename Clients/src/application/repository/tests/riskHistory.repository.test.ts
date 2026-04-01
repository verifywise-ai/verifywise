import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createRiskHistorySnapshot,
  getCurrentRiskParameterCounts,
  getRiskTimeseries,
} from "../riskHistory.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("riskHistory.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRiskTimeseries", () => {
    it("should fetch timeseries with only required parameter", async () => {
      const response = {
        data: { points: [] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getRiskTimeseries("severity");

      expect(apiServices.get).toHaveBeenCalledWith("/riskHistory/timeseries", {
        parameter: "severity",
        startDate: undefined,
        endDate: undefined,
        intervalHours: undefined,
        timeframe: undefined,
      });
      expect(result).toEqual(response);
    });

    it("should fetch timeseries with timeframe", async () => {
      const response = {
        data: { points: [{ x: "2026-03-01", y: 3 }] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getRiskTimeseries("likelihood", "1month");

      expect(apiServices.get).toHaveBeenCalledWith("/riskHistory/timeseries", {
        parameter: "likelihood",
        startDate: undefined,
        endDate: undefined,
        intervalHours: undefined,
        timeframe: "1month",
      });
      expect(result).toEqual(response);
    });

    it("should fetch timeseries with custom date range and interval", async () => {
      const response = {
        data: { points: [{ x: "2026-03-01", y: 2 }] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getRiskTimeseries(
        "risk_level",
        undefined,
        "2026-03-01",
        "2026-03-10",
        12,
      );

      expect(apiServices.get).toHaveBeenCalledWith("/riskHistory/timeseries", {
        parameter: "risk_level",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        intervalHours: 12,
        timeframe: undefined,
      });
      expect(result).toEqual(response);
    });

    it("should log and rethrow errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getRiskTimeseries("severity")).rejects.toThrow(
        "Network error",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching risk timeseries:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });

    it("should rethrow structured API errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = {
        response: { status: 500, statusText: "Internal Server Error" },
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getRiskTimeseries("severity")).rejects.toEqual(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching risk timeseries:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("getCurrentRiskParameterCounts", () => {
    it("should fetch current counts and return response.data", async () => {
      const responseData = { high: 2, medium: 4, low: 1 };
      const response = {
        data: responseData,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getCurrentRiskParameterCounts("severity");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/api/riskHistory/current-counts",
        {
          params: { parameter: "severity" },
        },
      );
      expect(result).toEqual(responseData);
    });

    it("should pass provided parameter in query params", async () => {
      const response = {
        data: { mitigated: 3, unmitigated: 5 },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getCurrentRiskParameterCounts("mitigation_status");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/api/riskHistory/current-counts",
        {
          params: { parameter: "mitigation_status" },
        },
      );
    });

    it("should log and rethrow errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = new Error("Counts fetch failed");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getCurrentRiskParameterCounts("severity")).rejects.toThrow(
        "Counts fetch failed",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching current risk parameter counts:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("createRiskHistorySnapshot", () => {
    it("should create snapshot with parameter and description", async () => {
      const responseData = {
        id: 10,
        parameter: "severity",
        description: "manual snapshot",
      };
      const response = {
        data: responseData,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createRiskHistorySnapshot(
        "severity",
        "manual snapshot",
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/api/riskHistory/snapshot",
        {
          parameter: "severity",
          description: "manual snapshot",
        },
      );
      expect(result).toEqual(responseData);
    });

    it("should create snapshot with undefined description", async () => {
      const responseData = { id: 11, parameter: "likelihood" };
      const response = {
        data: responseData,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createRiskHistorySnapshot("likelihood");

      expect(apiServices.post).toHaveBeenCalledWith(
        "/api/riskHistory/snapshot",
        {
          parameter: "likelihood",
          description: undefined,
        },
      );
      expect(result).toEqual(responseData);
    });

    it("should log and rethrow snapshot creation errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = new Error("Snapshot failed");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createRiskHistorySnapshot("risk_level")).rejects.toThrow(
        "Snapshot failed",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating risk history snapshot:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });

    it("should rethrow API conflict errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = {
        response: { status: 409, statusText: "Conflict" },
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createRiskHistorySnapshot("severity", "duplicate snapshot"),
      ).rejects.toEqual(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating risk history snapshot:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
