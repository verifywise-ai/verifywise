export enum ModelRiskCategory {
  PERFORMANCE = "Performance",
  BIAS = "Bias & Fairness",
  SECURITY = "Security",
  DATA_QUALITY = "Data Quality",
  COMPLIANCE = "Compliance",
}

export enum ModelRiskLevel {
  LOW = "Low",
  MEDIUM = "Medium",
  HIGH = "High",
  CRITICAL = "Critical",
}

export enum ModelRiskStatus {
  OPEN = "Open",
  IN_PROGRESS = "In Progress",
  RESOLVED = "Resolved",
  ACCEPTED = "Accepted",
}

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
  model_id?: number | null;
  created_at?: Date;
  updated_at?: Date;
  is_deleted?: boolean;
  deleted_at?: Date;
}

export interface IModelRiskFormData {
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
  model_id?: number | null;
}
