/**
 * Evaluation LLM API Keys Service
 *
 * Manages LLM provider API keys for evaluations.
 * Keys are encrypted and stored in the database per organization.
 */

import CustomAxios from "./customAxios";

export type LLMProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "mistral"
  | "huggingface"
  | "openrouter";

export interface LLMApiKey {
  provider: LLMProvider;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddKeyRequest {
  provider: LLMProvider;
  apiKey: string;
}

export interface GetKeysResponse {
  success: boolean;
  data: LLMApiKey[];
}

export interface AddKeyResponse {
  success: boolean;
  message: string;
  data: LLMApiKey;
}

export interface DeleteKeyResponse {
  success: boolean;
  message: string;
}

export interface VerifyKeyRequest {
  provider: string;
  apiKey: string;
}

export interface VerifyKeyResponse {
  success: boolean;
  valid: boolean;
  message: string;
}

class EvaluationLlmApiKeysService {
  private baseUrl = "/evaluation-llm-keys";

  /**
   * Get all API keys for the authenticated user's organization
   * Returns masked keys for security
   */
  async getAllKeys(): Promise<LLMApiKey[]> {
    try {
      const response = await CustomAxios.get<GetKeysResponse>(this.baseUrl);
      return response.data.data;
    } catch (error: any) {
      console.error("Failed to fetch LLM API keys:", error);
      throw error;
    }
  }

  /**
   * Add a new LLM API key
   * The key will be encrypted before storage
   */
  async addKey(request: AddKeyRequest): Promise<LLMApiKey> {
    try {
      const response = await CustomAxios.post<AddKeyResponse>(this.baseUrl, request);
      return response.data.data;
    } catch (error: any) {
      console.error("Failed to add LLM API key:", error);
      throw error;
    }
  }

  /**
   * Delete an LLM API key
   */
  async deleteKey(provider: LLMProvider): Promise<void> {
    try {
      await CustomAxios.delete<DeleteKeyResponse>(`${this.baseUrl}/${provider}`);
    } catch (error: any) {
      console.error("Failed to delete LLM API key:", error);
      throw error;
    }
  }

  /**
   * Check if a key exists for a provider
   */
  async hasKey(provider: LLMProvider): Promise<boolean> {
    try {
      const keys = await this.getAllKeys();
      return keys.some((k) => k.provider === provider);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Verify an API key by making a test call to the provider
   * This goes through the backend to avoid CORS issues
   */
  async verifyKey(request: VerifyKeyRequest): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await CustomAxios.post<VerifyKeyResponse>(`${this.baseUrl}/verify`, request);
      return {
        valid: response.data.valid,
        error: response.data.valid ? undefined : response.data.message,
      };
    } catch (error: any) {
      console.error("Failed to verify LLM API key:", error);
      // If backend verification fails, assume valid to not block user
      return { valid: true };
    }
  }
}

export const evaluationLlmApiKeysService = new EvaluationLlmApiKeysService();
