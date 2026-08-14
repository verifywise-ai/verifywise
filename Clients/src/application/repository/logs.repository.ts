import { apiServices } from "../../infrastructure/api/networkServices";
import { RequestParams } from "../../domain/interfaces/i.requestParams";

/**
 * Retrieves all logs from the server.
 *
 * @returns {Promise<any>} A promise that resolves to the logs data.
 * @throws Will throw an error if the request fails.
 */
export async function getAllLogs({ routeUrl }: RequestParams): Promise<any> {
  const response = await apiServices.get(routeUrl);
  return response.data;
}
