/**
 * API service for evaluation logs, metrics, and experiments
 */

import CustomAxios from "./customAxios";

export interface EvaluationLog {
  id: string;
  project_id: string;
  experiment_id?: string;
  trace_id?: string;
  parent_trace_id?: string;
  span_name?: string;
  input_text?: string;
  output_text?: string;
  model_name?: string;
  metadata?: Record<string, any>;
  latency_ms?: number;
  token_count?: number;
  cost?: number;
  status?: string;
  error_message?: string;
  timestamp: string;
  tenant: string;
  created_by?: number;
}

export interface EvaluationMetric {
  id: string;
  project_id: string;
  experiment_id?: string;
  metric_name: string;
  metric_type: string;
  value: number;
  dimensions?: Record<string, any>;
  timestamp: string;
  tenant: string;
}

export interface Experiment {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  baseline_experiment_id?: string;
  status: string;
  results?: Record<string, any>;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  tenant: string;
  created_by?: number;
  model_inventory_id?: number;
}

export interface MetricAggregates {
  average: number;
  min: number;
  max: number;
  count: number;
}

export interface MonitorDashboard {
  project_id: string;
  time_range: {
    start: string;
    end: string;
  };
  metrics: Record<string, MetricAggregates>;
  logs: {
    total: number;
    success: number;
    error: number;
    error_rate: number;
  };
  recent_experiments: Experiment[];
}

// ==================== LOGS ====================

export const evaluationLogsService = {
  // Create a new log
  async createLog(data: Partial<EvaluationLog>) {
    const response = await CustomAxios.post("/deepeval/logs", data);
    return response.data;
  },

  // Get logs with filtering
  async getLogs(params: {
    project_id?: string;
    experiment_id?: string;
    trace_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await CustomAxios.get("/deepeval/logs", { params, timeout: 60000 });
    return response.data;
  },

  // Get a specific log
  async getLog(logId: string) {
    const response = await CustomAxios.get(`/deepeval/logs/${logId}`);
    return response.data;
  },

  // Get trace logs
  async getTraceLogs(traceId: string) {
    const response = await CustomAxios.get(`/deepeval/logs/trace/${traceId}`);
    return response.data;
  },
};

// ==================== METRICS ====================

export const metricsService = {
  // Create a new metric
  async createMetric(data: Partial<EvaluationMetric>) {
    const response = await CustomAxios.post("/deepeval/metrics", data);
    return response.data;
  },

  // Get metrics with filtering
  async getMetrics(params: {
    project_id?: string;
    experiment_id?: string;
    metric_name?: string;
    metric_type?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }) {
    const response = await CustomAxios.get("/deepeval/metrics", { params });
    return response.data;
  },

  // Get metric aggregates
  async getMetricAggregates(params: {
    project_id: string;
    metric_name: string;
    start_date?: string;
    end_date?: string;
  }) {
    const response = await CustomAxios.get("/deepeval/metrics/aggregates", { params });
    return response.data;
  },
};

// ==================== MODEL VALIDATION ====================

export interface ModelValidationResult {
  valid: boolean;
  model_name: string;
  provider: string | null;
  has_api_key: boolean;
  has_openrouter_fallback: boolean;
  error_message: string | null;
}

export const modelValidationService = {
  // Validate that a model's API key is available
  async validateModel(modelName: string, provider?: string): Promise<ModelValidationResult> {
    const response = await CustomAxios.post("/deepeval/models/validate", {
      model_name: modelName,
      provider,
    });
    return response.data;
  },
};

// ==================== EXPERIMENTS ====================

export const experimentsService = {
  // Validate model before creating experiment
  async validateModelForExperiment(config: Record<string, any>): Promise<ModelValidationResult | null> {
    const modelName = config?.model?.name;
    const provider = config?.model?.provider;

    if (!modelName) {
      return null; // No model to validate
    }

    return modelValidationService.validateModel(modelName, provider);
  },

  // Create a new experiment
  async createExperiment(data: {
    project_id: string;
    name: string;
    description?: string;
    config: Record<string, any>;
    baseline_experiment_id?: string;
    model_inventory_id?: number;
  }) {
    const response = await CustomAxios.post("/deepeval/experiments", data);
    return response.data;
  },

  // Get experiments with filtering
  async getExperiments(params: {
    project_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await CustomAxios.get("/deepeval/experiments", { params, timeout: 60000 });
    return response.data;
  },

  // Get all experiments (no pagination)
  async getAllExperiments(params: {
    project_id?: string;
    status?: string;
  }) {
    const response = await CustomAxios.get("/deepeval/experiments/all", { params, timeout: 60000 });
    return response.data;
  },

  // Get a specific experiment
  async getExperiment(experimentId: string) {
    const response = await CustomAxios.get(`/deepeval/experiments/${experimentId}`);
    return response.data;
  },

  // Update experiment
  async updateExperiment(
    experimentId: string,
    data: {
      name?: string;
      description?: string;
    }
  ) {
    const response = await CustomAxios.patch(`/deepeval/experiments/${experimentId}`, data);
    return response.data;
  },

  // Update experiment status
  async updateExperimentStatus(
    experimentId: string,
    data: {
      status: string;
      results?: Record<string, any>;
      error_message?: string;
    }
  ) {
    const response = await CustomAxios.put(`/deepeval/experiments/${experimentId}/status`, data);
    return response.data;
  },

  // Delete an experiment
  async deleteExperiment(experimentId: string) {
    const response = await CustomAxios.delete(`/deepeval/experiments/${experimentId}`);
    return response.data;
  },
};

// ==================== MONITORING ====================

export const monitoringService = {
  // Get monitoring dashboard data
  async getDashboard(
    projectId: string,
    params?: {
      start_date?: string;
      end_date?: string;
    }
  ): Promise<{ data: MonitorDashboard }> {
    const response = await CustomAxios.get(`/deepeval/projects/${projectId}/monitor/dashboard`, {
      params,
    });
    return response.data;
  },
};
