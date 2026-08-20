/**
 * TypeScript mirror of the EvalServer request schemas.
 *
 * Source of truth: EvalServer/src/request_schemas.py and the inline models in
 * EvalServer/src/routers/evaluation_logs.py. The generated artifact
 * EvalServer/openapi.json is produced by EvalServer/scripts/export_openapi.py.
 *
 * `EVAL_SERVER_REQUEST_SHAPES` is consumed by the contract test
 * (routes/__tests__/evalServerContract.test.ts), which fails if the committed
 * OpenAPI spec drifts from these shapes in either direction.
 *
 * Casing mirrors the server exactly: camelCase for the deepeval router schemas
 * (evaluate/scorers/models), snake_case for the evaluation_logs models
 * (experiments/metrics).
 */

/** POST /deepeval/evaluate — EvaluateConfig (all optional, extra keys allowed) */
export interface EvaluateConfig {
  dataset?: Record<string, unknown>;
  model?: Record<string, unknown>;
  judgeLlm?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  metric_thresholds?: Record<string, unknown>;
  selectedScorers?: string[];
}

/** POST /deepeval/scorers — CreateScorerRequest */
export interface CreateScorerRequest {
  name: string;
  metricKey: string;
  id?: string;
  orgId?: string;
  type?: string;
  description?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  defaultThreshold?: number;
  weight?: number;
  createdBy?: string;
}

/** PUT /deepeval/scorers/{scorer_id} — UpdateScorerRequest (partial) */
export interface UpdateScorerRequest {
  name?: string;
  description?: string;
  type?: string;
  metricKey?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  defaultThreshold?: number;
  weight?: number;
}

/** POST /deepeval/scorers/{scorer_id}/test — ScorerTestRequest */
export interface ScorerTestRequest {
  input: string;
  output: string;
  expected?: string;
}

/** POST /deepeval/models — CreateModelRequest */
export interface CreateEvalModelRequest {
  orgId: string;
  name: string;
  provider: string;
  id?: string;
  endpointUrl?: string;
  createdBy?: string;
}

/** PUT /deepeval/models/{model_id} — UpdateModelRequest (partial) */
export interface UpdateEvalModelRequest {
  name?: string;
  provider?: string;
  endpointUrl?: string;
}

/** POST /deepeval/experiments — CreateExperimentRequest */
export interface CreateExperimentRequest {
  project_id: string;
  name: string;
  config: Record<string, unknown>;
  description?: string;
  baseline_experiment_id?: string;
  model_inventory_id?: number;
}

/** PATCH /deepeval/experiments/{experiment_id} — UpdateExperimentRequest */
export interface UpdateExperimentRequest {
  name?: string;
  description?: string;
}

/** POST /deepeval/metrics — CreateMetricRequest */
export interface CreateMetricRequest {
  project_id: string;
  metric_name: string;
  metric_type: string;
  value: number;
  experiment_id?: string;
  dimensions?: Record<string, unknown>;
}

export interface EvalServerRequestShape {
  /** Field names the OpenAPI schema must list as required. */
  required: string[];
  /** Exact set of property names the OpenAPI schema must declare. */
  properties: string[];
}

/**
 * Expected request-body shape per endpoint, keyed as "METHOD /path".
 * Keep in sync with the interfaces above and the EvalServer schemas.
 */
export const EVAL_SERVER_REQUEST_SHAPES: Record<string, EvalServerRequestShape> = {
  "POST /deepeval/evaluate": {
    required: [],
    properties: ["dataset", "model", "judgeLlm", "metrics", "metric_thresholds", "selectedScorers"],
  },
  "POST /deepeval/scorers": {
    required: ["name", "metricKey"],
    properties: [
      "name",
      "metricKey",
      "id",
      "orgId",
      "type",
      "description",
      "config",
      "enabled",
      "defaultThreshold",
      "weight",
      "createdBy",
    ],
  },
  "PUT /deepeval/scorers/{scorer_id}": {
    required: [],
    properties: [
      "name",
      "description",
      "type",
      "metricKey",
      "config",
      "enabled",
      "defaultThreshold",
      "weight",
    ],
  },
  "POST /deepeval/scorers/{scorer_id}/test": {
    required: ["input", "output"],
    properties: ["input", "output", "expected"],
  },
  "POST /deepeval/models": {
    required: ["orgId", "name", "provider"],
    properties: ["orgId", "name", "provider", "id", "endpointUrl", "createdBy"],
  },
  "PUT /deepeval/models/{model_id}": {
    required: [],
    properties: ["name", "provider", "endpointUrl"],
  },
  "POST /deepeval/experiments": {
    required: ["project_id", "name", "config"],
    properties: [
      "project_id",
      "name",
      "config",
      "description",
      "baseline_experiment_id",
      "model_inventory_id",
    ],
  },
  "PATCH /deepeval/experiments/{experiment_id}": {
    required: [],
    properties: ["name", "description"],
  },
  "POST /deepeval/metrics": {
    required: ["project_id", "metric_name", "metric_type", "value"],
    properties: [
      "project_id",
      "metric_name",
      "metric_type",
      "value",
      "experiment_id",
      "dimensions",
    ],
  },
};
