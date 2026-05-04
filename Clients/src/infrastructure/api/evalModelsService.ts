/**
 * Evaluation Models Service
 *
 * Manages saved model configurations for experiments.
 * Models are stored in the database per organization and can be selected when running experiments.
 */

import CustomAxios from "./customAxios";

export interface SavedModel {
  id: string;
  orgId: string;
  name: string;
  provider: string;
  endpointUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface CreateModelRequest {
  orgId?: string;
  name: string;
  provider: string;
  endpointUrl?: string;
}

export interface UpdateModelRequest {
  name?: string;
  provider?: string;
  endpointUrl?: string;
}

interface ListModelsResponse {
  models: SavedModel[];
}

interface CreateModelResponse {
  model: SavedModel;
}

interface UpdateModelResponse {
  model: SavedModel;
}

interface DeleteModelResponse {
  message: string;
  modelId: string;
}

class EvalModelsService {
  private baseUrl = "/deepeval/models";

  /**
   * Get all saved models for the organization
   */
  async listModels(orgId?: string): Promise<SavedModel[]> {
    try {
      const params = orgId ? { org_id: orgId } : {};
      const response = await CustomAxios.get<ListModelsResponse>(this.baseUrl, { params });
      return response.data.models || [];
    } catch (error) {
      console.error("Failed to fetch models:", error);
      return [];
    }
  }

  /**
   * Create a new saved model configuration
   */
  async createModel(request: CreateModelRequest): Promise<SavedModel | null> {
    try {
      const response = await CustomAxios.post<CreateModelResponse>(this.baseUrl, request);
      return response.data.model;
    } catch (error) {
      console.error("Failed to create model:", error);
      return null;
    }
  }

  /**
   * Update an existing saved model
   */
  async updateModel(modelId: string, request: UpdateModelRequest): Promise<SavedModel | null> {
    try {
      const response = await CustomAxios.put<UpdateModelResponse>(
        `${this.baseUrl}/${modelId}`,
        request,
      );
      return response.data.model;
    } catch (error) {
      console.error("Failed to update model:", error);
      return null;
    }
  }

  /**
   * Delete a saved model
   */
  async deleteModel(modelId: string): Promise<boolean> {
    try {
      await CustomAxios.delete<DeleteModelResponse>(`${this.baseUrl}/${modelId}`);
      return true;
    } catch (error) {
      console.error("Failed to delete model:", error);
      return false;
    }
  }
}

export const evalModelsService = new EvalModelsService();
