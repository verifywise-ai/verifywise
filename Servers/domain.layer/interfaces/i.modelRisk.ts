import { ModelRiskCategory } from "../enums/model-risk-category.enum";
import { ModelRiskLevel } from "../enums/model-risk-level.enum";
import { ModelRiskStatus } from "../enums/model-risk-status.enum";

export interface IModelRisk {
  id?: number;
  risk_name: string;
  risk_category: ModelRiskCategory;
  risk_level: ModelRiskLevel;
  status: ModelRiskStatus;
  owner: string;
  target_date: string;
  description?: string;
  mitigation_plan?: string;
  impact?: string;
  likelihood?: string;
  key_metrics?: string;
  current_values?: string;
  threshold?: string;
  model_id?: number;
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;
}
