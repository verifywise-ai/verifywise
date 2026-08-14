/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";
import { IModelInventory } from "../../domain/interfaces/i.modelInventory";

/**
 * Creates a new model inventory entry in the database.
 *
 * @param {string} routeUrl - The API route URL.
 * @param {any} data - The model inventory data to be saved.
 * @returns {Promise<any>} The response from the API.
 */
export async function createModelInventory(routeUrl: string, data: any): Promise<any> {
  const response = await apiServices.post(routeUrl, data);
  return response.data;
}

/**
 * Retrieves all model inventory entries for the current organization.
 *
 * @param {AbortSignal} [signal] - Optional abort signal to cancel the request.
 * @returns {Promise<IModelInventory[]>} The list of model inventory entries.
 */
export async function getModelInventories(signal?: AbortSignal): Promise<IModelInventory[]> {
  const response = await apiServices.get<{ data: IModelInventory[] }>("/modelInventory", {
    signal,
  });
  return response.data?.data ?? [];
}
