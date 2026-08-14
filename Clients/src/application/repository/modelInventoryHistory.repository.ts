import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Get timeseries data for a specific parameter
 *
 * @param {string} parameter - The parameter to track (e.g., 'status', 'security_assessment')
 * @param {string} [timeframe] - Optional timeframe: '7days', '15days', '1month', '3months', '6months', '1year'
 * @param {string} [startDate] - Optional custom start date (ISO format)
 * @param {string} [endDate] - Optional custom end date (ISO format)
 * @param {number} [intervalHours] - Optional interval in hours for data points (default: 24)
 * @returns {Promise<any>} The timeseries data
 */
export async function getModelInventoryTimeseries(
  parameter: string,
  timeframe?: string,
  startDate?: string,
  endDate?: string,
  intervalHours?: number,
): Promise<any> {
  const response = await apiServices.get("/modelInventoryHistory/timeseries", {
    parameter,
    startDate,
    endDate,
    intervalHours,
    timeframe,
  });
  return response;
}

/**
 * Get current parameter counts
 *
 * @param {string} parameter - The parameter to get counts for
 * @returns {Promise<any>} The current counts
 */
export async function getCurrentParameterCounts(parameter: string): Promise<any> {
  const response = await apiServices.get("/api/modelInventoryHistory/current-counts", {
    params: { parameter },
  });
  return response.data;
}

/**
 * Manually create a history snapshot
 *
 * @param {string} parameter - The parameter to snapshot
 * @param {string} [description] - Optional description of the snapshot
 * @returns {Promise<any>} The created snapshot
 */
export async function createHistorySnapshot(parameter: string, description?: string): Promise<any> {
  const response = await apiServices.post("/api/modelInventoryHistory/snapshot", {
    parameter,
    description,
  });
  return response.data;
}
