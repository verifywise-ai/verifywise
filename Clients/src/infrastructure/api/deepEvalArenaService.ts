/**
 * DeepEval Arena API Service
 *
 * Manages LLM Arena comparisons using ArenaGEval.
 * Based on DeepEval's LLM Arena: https://deepeval.com/docs/getting-started-llm-arena
 */

import CustomAxios from "./customAxios";

// Types for Arena functionality
export interface ArenaTestCase {
  input: string;
  actualOutput: string;
  expectedOutput?: string;
  context?: string[];
  retrievalContext?: string[];
}

export interface ArenaContestant {
  name: string;
  hyperparameters: Record<string, unknown>;
  testCases: ArenaTestCase[];
}

export interface ArenaMetricConfig {
  name: string;
  criteria: string;
  evaluationParams: (
    | "input"
    | "actual_output"
    | "expected_output"
    | "context"
    | "retrieval_context"
  )[];
}

export interface CreateArenaComparisonRequest {
  name: string;
  description?: string;
  orgId?: string;
  contestants: ArenaContestant[];
  datasetPath?: string;
  metric: ArenaMetricConfig;
  judgeModel?: string;
  judgeProvider?: string;
  apiKeys?: Record<string, string>; // Provider -> API key mapping
}

export interface ArenaComparisonResult {
  testCaseIndex: number;
  input: string;
  winner: string | null;
  reason: string;
  contestants: {
    name: string;
    output: string;
    model?: string;
    provider?: string;
    scores?: Record<string, number>;
  }[];
  criteria?: string[];
}

export interface ArenaComparison {
  id: string;
  name: string;
  description?: string;
  orgId?: string;
  contestants: ArenaContestant[];
  contestantNames: string[];
  metricConfig: ArenaMetricConfig;
  judgeModel: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: string;
  winner?: string;
  winCounts: Record<string, number>;
  detailedResults: ArenaComparisonResult[];
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  createdBy?: string;
}

export interface ArenaComparisonSummary {
  id: string;
  name: string;
  description?: string;
  status: "pending" | "running" | "completed" | "failed";
  contestants: string[];
  winner?: string;
  dataset?: string;
  createdAt: string;
  completedAt?: string;
}

const BASE_URL = "/deepeval";

// API timeout for arena operations (matches experiments)
const API_TIMEOUT_MS = 60000;

class DeepEvalArenaService {
  /**
   * Create and start a new arena comparison
   */
  async createComparison(data: CreateArenaComparisonRequest): Promise<{
    id: string;
    status: string;
    message: string;
    contestants: string[];
  }> {
    const response = await CustomAxios.post(`${BASE_URL}/arena/compare`, data);
    return response.data;
  }

  /**
   * List all arena comparisons for the current tenant
   */
  async listComparisons(params?: { org_id?: string }): Promise<{
    comparisons: ArenaComparisonSummary[];
  }> {
    // Match experiments timeout (60s)
    const response = await CustomAxios.get(`${BASE_URL}/arena/comparisons`, {
      params,
      timeout: API_TIMEOUT_MS,
    });
    return response.data;
  }

  /**
   * Get the status of a specific arena comparison
   */
  async getComparisonStatus(comparisonId: string): Promise<{
    id: string;
    name: string;
    status: "pending" | "running" | "completed" | "failed";
    progress?: string;
    contestants: string[];
    createdAt: string;
    updatedAt?: string;
  }> {
    // Match experiments timeout (60s)
    const response = await CustomAxios.get(`${BASE_URL}/arena/comparisons/${comparisonId}`, {
      timeout: API_TIMEOUT_MS,
    });
    return response.data;
  }

  /**
   * Get the full results of a completed arena comparison
   */
  async getComparisonResults(comparisonId: string): Promise<{
    id: string;
    name: string;
    description?: string;
    status: "pending" | "running" | "completed" | "failed";
    metric: ArenaMetricConfig;
    judgeModel: string;
    results: {
      winner: string | null;
      winCounts: Record<string, number>;
      detailedResults: ArenaComparisonResult[];
    };
    contestants: string[];
    contestantInfo?: Array<{
      name: string;
      model: string;
      provider: string;
    }>;
    createdAt: string;
    completedAt?: string;
    errorMessage?: string;
  }> {
    // Match experiments timeout (60s)
    const response = await CustomAxios.get(
      `${BASE_URL}/arena/comparisons/${comparisonId}/results`,
      { timeout: API_TIMEOUT_MS },
    );
    return response.data;
  }

  /**
   * Delete an arena comparison
   */
  async deleteComparison(comparisonId: string): Promise<{
    message: string;
    id: string;
  }> {
    // Delete operations should also have reasonable timeout
    const response = await CustomAxios.delete(`${BASE_URL}/arena/comparisons/${comparisonId}`, {
      timeout: API_TIMEOUT_MS,
    });
    return response.data;
  }
}

export const deepEvalArenaService = new DeepEvalArenaService();
