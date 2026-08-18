/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Creates a new model inventory entry in the database.
 *
 * @param {string} routeUrl - The API route URL.
 * @param {any} data - The model inventory data to be saved.
 * @returns {Promise<any>} The response from the API.
 */
export async function createPolicyLinkedObjects(routeUrl: string, data: any): Promise<any> {
  const response = await apiServices.post(routeUrl, data);
  return response.data;
}
