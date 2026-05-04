import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Get timeseries data for a specific risk parameter
 *
 * @param {string} parameter - The parameter to track (e.g., 'severity', 'likelihood', 'mitigation_status', 'risk_level')
 * @param {string} [timeframe] - Optional timeframe: '7days', '15days', '1month', '3months', '6months', '1year'
 * @param {string} [startDate] - Optional custom start date (ISO format)
 * @param {string} [endDate] - Optional custom end date (ISO format)
 * @param {number} [intervalHours] - Optional interval in hours for data points (default: 24)
 * @returns {Promise<any>} The timeseries data
 */
export async function getRiskTimeseries(
  parameter: string,
  timeframe?: string,
  startDate?: string,
  endDate?: string,
  intervalHours?: number,
): Promise<any> {
  try {
    const response = await apiServices.get("/riskHistory/timeseries", {
      parameter,
      startDate,
      endDate,
      intervalHours,
      timeframe,
    });
    return response;
  } catch (error: any) {
    console.error("Error fetching risk timeseries:", error);
    throw error;
  }
}

/**
 * Get current parameter counts
 *
 * @param {string} parameter - The parameter to get counts for
 * @returns {Promise<any>} The current counts
 */
export async function getCurrentRiskParameterCounts(parameter: string): Promise<any> {
  try {
    const response = await apiServices.get("/api/riskHistory/current-counts", {
      params: { parameter },
    });
    return response.data;
  } catch (error: any) {
    console.error("Error fetching current risk parameter counts:", error);
    throw error;
  }
}

/**
 * Manually create a risk history snapshot
 *
 * @param {string} parameter - The parameter to snapshot
 * @param {string} [description] - Optional description of the snapshot
 * @returns {Promise<any>} The created snapshot
 */
export async function createRiskHistorySnapshot(
  parameter: string,
  description?: string,
): Promise<any> {
  try {
    const response = await apiServices.post("/api/riskHistory/snapshot", {
      parameter,
      description,
    });
    return response.data;
  } catch (error: any) {
    console.error("Error creating risk history snapshot:", error);
    throw error;
  }
}
