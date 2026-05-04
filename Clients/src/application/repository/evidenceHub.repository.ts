/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Creates a new incident management entry in the database.
 *
 * @param {string} routeUrl - The API route URL.
 * @param {any} data - The incident management data to be saved.
 * @param {string} [authToken=getAuthToken()] - Optional auth token.
 * @returns {Promise<any>} The response from the API.
 */
export async function createEvidenceHub(routeUrl: string, data: any): Promise<any> {
  try {
    const response = await apiServices.post(routeUrl, data);
    return response.data;
  } catch (error) {
    console.error("Error creating incident management:", error);
    throw error;
  }
}
