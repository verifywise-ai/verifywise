import { apiServices } from "../../infrastructure/api/networkServices";

//Add training registry data to the database by sending a "POST" request to "/training"
/**
 * Adds a new training registry entry to the database.
 *
 * @param {any} data - The training data to be saved.
 * @returns {Promise<any>} The response from the API.
 */
export async function createTraining(routeUrl: string, data: any): Promise<any> {
  try {
    const response = await apiServices.post(routeUrl, data);
    return response.data;
  } catch (error) {
    console.error("Error creating training:", error);
    throw error;
  }
}
