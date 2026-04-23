import { apiServices } from "../../infrastructure/api/networkServices";

export interface ModelEvaluation {
  id: string;
  name: string;
  status: string;
  config: Record<string, any>;
  results?: Record<string, any>;
  error_message?: string;
  error?: string;
  completed_at?: string;
  created_at: string;
  created_by?: string;
  eval_type: "experiment" | "bias_audit";
  model_inventory_id?: number;
  model_provider?: string;
  model_name?: string;
  model_version?: string;
}

export interface ModelEvaluationsResponse {
  experiments: ModelEvaluation[];
  biasAudits: ModelEvaluation[];
}

export async function getAllModelEvaluations(): Promise<ModelEvaluationsResponse> {
  const response = await apiServices.get("/modelInventory/evaluations");
  return response.data as ModelEvaluationsResponse;
}
