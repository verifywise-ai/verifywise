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
  try {
    const response = await apiServices.post(routeUrl, data);
    return response.data;
  } catch (error: any) {
    console.error("Error creating dataset:", error);
    throw error;
  }
}

/**
 * Gets all datasets.
 *
 * @returns {Promise<any>} The response from the API.
 */
export async function getAllDatasets(): Promise<any> {
  try {
    const response = await apiServices.get("/datasets");
    return response.data;
  } catch (error: any) {
    console.error("Error fetching datasets:", error);
    throw error;
  }
}

/**
 * Gets a dataset by ID.
 *
 * @param {number} id - The dataset ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetById(id: number): Promise<any> {
  try {
    const response = await apiServices.get(`/datasets/${id}`);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching dataset:", error);
    throw error;
  }
}

/**
 * Gets datasets by model ID.
 *
 * @param {number} modelId - The model inventory ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetsByModelId(modelId: number): Promise<any> {
  try {
    const response = await apiServices.get(`/datasets/by-model/${modelId}`);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching datasets by model:", error);
    throw error;
  }
}

/**
 * Gets datasets by project ID.
 *
 * @param {number} projectId - The project ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetsByProjectId(projectId: number): Promise<any> {
  try {
    const response = await apiServices.get(`/datasets/by-project/${projectId}`);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching datasets by project:", error);
    throw error;
  }
}

/**
 * Updates a dataset.
 *
 * @param {number} id - The dataset ID.
 * @param {any} data - The updated dataset data.
 * @returns {Promise<any>} The response from the API.
 */
export async function updateDataset(id: number, data: any): Promise<any> {
  try {
    const response = await apiServices.patch(`/datasets/${id}`, data);
    return response.data;
  } catch (error: any) {
    console.error("Error updating dataset:", error);
    throw error;
  }
}

/**
 * Deletes a dataset.
 *
 * @param {number} id - The dataset ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function deleteDataset(id: number): Promise<any> {
  try {
    const response = await apiServices.delete(`/datasets/${id}`);
    return response.data;
  } catch (error: any) {
    console.error("Error deleting dataset:", error);
    throw error;
  }
}

/**
 * Gets the change history for a dataset.
 *
 * @param {number} id - The dataset ID.
 * @returns {Promise<any>} The response from the API.
 */
export async function getDatasetHistory(id: number): Promise<any> {
  try {
    const response = await apiServices.get(`/datasets/${id}/history`);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching dataset history:", error);
    throw error;
  }
}
