/**
 * Evaluation Models Service
 *
 * Manages saved model configurations for experiments.
 * Models are stored in the database per organization and can be selected when running experiments.
 * Also fetches the live LiteLLM model catalog from the AI Gateway.
 */

import CustomAxios from "./customAxios";
import type { ModelInfo } from "../../presentation/utils/providers";

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

// ── AI Gateway LiteLLM model catalog ─────────────────────────────────────────

interface GatewayModelItem {
  id: string;
  provider: string;
  mode: string;
}

interface GatewayModelsResponse {
  providers: string[];
  models: Record<string, GatewayModelItem[]>;
  total: number;
}

/**
 * Maps frontend provider IDs to the LiteLLM provider key used by AI Gateway.
 * The gateway groups models under the LiteLLM provider name, not ours.
 */
const EVAL_TO_LITELLM: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
  mistral: "mistral",
  xai: "xai",
  openrouter: "openrouter",
};

/**
 * LiteLLM prefixes model IDs with the provider name for some providers
 * (e.g. "gemini/gemini-2.5-pro", "mistral/mistral-large-2512", "xai/grok-2").
 * Strip the prefix so our IDs stay consistent with the existing static catalogs.
 */
function normalizeModelId(modelId: string, litellmProvider: string): string {
  const prefix = litellmProvider + "/";
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

// Module-level cache so all component instances share one fetch per session.
let _gatewayModelsCache: GatewayModelsResponse | null = null;
let _gatewayModelsCacheExpiry = 0;
const GATEWAY_MODELS_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  /**
   * Fetch the live LiteLLM model catalog from AI Gateway and return chat-mode
   * models for the given frontend provider ID (e.g. "openai", "google").
   * Results are cached for 5 minutes. Falls back to [] if AI Gateway is down.
   */
  async getGatewayModelsForProvider(evalProvider: string): Promise<ModelInfo[]> {
    const litellmProvider = EVAL_TO_LITELLM[evalProvider];
    if (!litellmProvider) return [];

    try {
      if (!_gatewayModelsCache || Date.now() > _gatewayModelsCacheExpiry) {
        const response = await CustomAxios.get<GatewayModelsResponse>("/ai-gateway/v1/models");
        _gatewayModelsCache = response.data;
        _gatewayModelsCacheExpiry = Date.now() + GATEWAY_MODELS_TTL_MS;
      }

      const providerModels = _gatewayModelsCache?.models?.[litellmProvider] ?? [];
      return providerModels
        .filter((m) => m.mode === "chat")
        .map((m) => ({
          id: normalizeModelId(m.id, litellmProvider),
          name: normalizeModelId(m.id, litellmProvider),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
}

export const evalModelsService = new EvalModelsService();
