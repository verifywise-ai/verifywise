import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as riskHistoryUtils from "../../../utils/history/riskHistory.utils";
import { availableRiskTools } from "../../functions/riskFunctions";
import { availableModelInventoryTools } from "../../functions/modelInventoryFunctions";
import { mockTimeseriesData } from "../../mocks/mockRiskData";
import { createMockTenant } from "../../mocks/mockTenant";

const availableTools = {
  ...availableRiskTools,
  ...availableModelInventoryTools,
};

// Mock the utility modules
jest.mock("../../../utils/history/riskHistory.utils");

describe("Advisor Functions: getRiskHistoryTimeseries", () => {
  const mockTenant = createMockTenant();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getRiskHistoryTimeseries = availableTools["get_risk_history_timeseries"];

  it("should fetch timeseries data for correct parameter and timeframe", async () => {
    jest.spyOn(riskHistoryUtils, "getTimeseriesForTimeframe").mockResolvedValue(mockTimeseriesData);

    const result = await getRiskHistoryTimeseries(
      { parameter: "severity", timeframe: "7days" },
      mockTenant,
    );

    expect(riskHistoryUtils.getTimeseriesForTimeframe).toHaveBeenCalledWith(
      "severity",
      "7days",
      mockTenant,
    );
    expect(result).toEqual(mockTimeseriesData);

    const mitigrationResult = await getRiskHistoryTimeseries(
      { parameter: "mitigation_status", timeframe: "1month" },
      mockTenant,
    );

    expect(riskHistoryUtils.getTimeseriesForTimeframe).toHaveBeenCalledWith(
      "mitigation_status",
      "1month",
      mockTenant,
    );
    expect(mitigrationResult).toEqual(mockTimeseriesData);
  });

  it("should return array of timeseries data points with correct structure", async () => {
    jest.spyOn(riskHistoryUtils, "getTimeseriesForTimeframe").mockResolvedValue(mockTimeseriesData);

    const result = await getRiskHistoryTimeseries(
      { parameter: "severity", timeframe: "7days" },
      mockTenant,
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Check each data point has required structure
    result.forEach((dataPoint: any) => {
      expect(dataPoint).toHaveProperty("timestamp");
      expect(dataPoint).toHaveProperty("data");
      expect(dataPoint.timestamp).toBeInstanceOf(Date);
      expect(typeof dataPoint.data).toBe("object");
    });
  });

  it("should handle empty timeseries data", async () => {
    jest.spyOn(riskHistoryUtils, "getTimeseriesForTimeframe").mockResolvedValue([]);

    const result = await getRiskHistoryTimeseries(
      { parameter: "severity", timeframe: "7days" },
      mockTenant,
    );

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it("should preserve timestamp ordering in timeseries data", async () => {
    jest.spyOn(riskHistoryUtils, "getTimeseriesForTimeframe").mockResolvedValue(mockTimeseriesData);

    const result = await getRiskHistoryTimeseries(
      { parameter: "severity", timeframe: "1month" },
      mockTenant,
    );

    // Verify timestamps are in chronological order
    for (let i = 1; i < result.length; i++) {
      const prevTime = new Date(result[i - 1].timestamp).getTime();
      const currTime = new Date(result[i].timestamp).getTime();
      expect(currTime).toBeGreaterThanOrEqual(prevTime);
    }
  });
});
