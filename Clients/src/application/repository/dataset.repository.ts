/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Creates a new dataset entry in the database.
 *
 * @param {string} routeUrl - The API route URL.
 * @param {any} data - The dataset data to be saved.
 * @returns {Promise<any>} The response from the API.
 */
export async function createDataset(routeUrl: string, data: any): Promise<any> {
  const response = await apiServices.post(routeUrl, data);
  return response.data;
}

/**
 * Gets all datasets.
 *
 * @returns {Promise<any>} The response from the API.
 */
export async function getAllDatasets(): Promise<any> {
  const response = await apiServices.get("/datasets");
  return response.data;
}

/**
 * Gets a dataset by ID.
 *
 * @param {number} id - The dataset ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetById(id: number): Promise<any> {
  const response = await apiServices.get(`/datasets/${id}`);
  return response.data;
}

/**
 * Gets datasets by model ID.
 *
 * @param {number} modelId - The model inventory ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetsByModelId(modelId: number): Promise<any> {
  const response = await apiServices.get(`/datasets/by-model/${modelId}`);
  return response.data;
}

/**
 * Gets datasets by project ID.
 *
 * @param {number} projectId - The project ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetsByProjectId(projectId: number): Promise<any> {
  const response = await apiServices.get(`/datasets/by-project/${projectId}`);
  return response.data;
}

/**
 * Updates a dataset.
 *
 * @param {number} id - The dataset ID.
 * @param {any} data - The updated dataset data.
 * @returns {Promise<any>} The response from the API.
 */
export async function updateDataset(id: number, data: any): Promise<any> {
  const response = await apiServices.patch(`/datasets/${id}`, data);
  return response.data;
}

/**
 * Deletes a dataset.
 *
 * @param {number} id - The dataset ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function deleteDataset(id: number): Promise<any> {
  const response = await apiServices.delete(`/datasets/${id}`);
  return response.data;
}

/**
 * Gets the change history for a dataset.
 *
 * @param {number} id - The dataset ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetHistory(id: number): Promise<any> {
  const response = await apiServices.get(`/datasets/${id}/history`);
  return response.data;
}
