import { LifecycleStage } from "../enums/lifecycle-stage.enum";
import { AiRiskClassification } from "../enums/ai-risk-classification.enum";
import { HighRiskRole } from "../enums/high-risk-role.enum";
import { ProjectStatus } from "../enums/project-status.enum";
import { IProjectFramework } from "./i.projectFramework";

export interface IProjectAttributes {
  id?: number;
  uc_id?: string;
  project_title: string;
  owner: number;
  start_date: Date;
  geography: number;
  ai_risk_classification?: AiRiskClassification | null;
  /** EU AI Act roles, normalised: no duplicates, Provider first. */
  high_risk_roles?: HighRiskRole[];
  /**
   * Deprecated, derived from high_risk_roles (Provider when present, else
   * Deployer, else null). Never stored.
   */
  type_of_high_risk_role?: HighRiskRole | null;
  goal: string;
  target_industry: string;
  description: string;
  last_updated: Date;
  last_updated_by: number;
  created_at?: Date;
  framework?: IProjectFramework[];
  is_organizational?: boolean;
  status?: ProjectStatus;
  approval_workflow_id?: number;
  pending_frameworks?: number[];
  enable_ai_data_insertion?: boolean;
  _source?: string; // Plugin source identifier (e.g., 'jira-assets')

  // Regulation-agnostic use-case classification
  use_case_category?: string | null;
  use_case_purpose?: string | null;
  use_case_audience?: string | null;
  deployment_context?: string | null;

  // Lifecycle (#5187). Separate from status, which is a project-management state.
  lifecycle_stage?: LifecycleStage;
  go_live_date?: string | null; // YYYY-MM-DD
  retired_at?: Date | null;
  last_confirmed_at?: Date | null;
  last_confirmed_by?: number | null;
  confirmation_reminded_at?: Date | null;
  department?: string | null;

  // Statistical fields
  doneSubcontrols?: number;
  totalSubcontrols?: number;
  answeredAssessments?: number;
  totalAssessments?: number;
}
