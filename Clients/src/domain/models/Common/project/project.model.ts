import { AiRiskClassification } from "../../../enums/aiRiskClassification.enum";
import { HighRiskRole } from "../../../enums/highRiskRole.enum";

export class ProjectModel {
  id?: number;
  uc_id?: string;
  project_title!: string;
  owner!: number;
  start_date!: Date;
  ai_risk_classification?: AiRiskClassification | null;
  type_of_high_risk_role?: HighRiskRole | null;
  goal!: string;
  last_updated!: Date;
  last_updated_by!: number;
  is_demo?: boolean;
  created_at?: Date;
  is_organizational!: boolean;

  // Regulation-agnostic use-case classification
  use_case_category?: string | null;
  use_case_purpose?: string | null;
  use_case_audience?: string | null;
  deployment_context?: string | null;

  constructor(data: ProjectModel) {
    this.id = data.id;
    this.uc_id = data.uc_id;
    this.project_title = data.project_title;
    this.owner = data.owner;
    this.start_date = data.start_date;
    this.ai_risk_classification = data.ai_risk_classification;
    this.type_of_high_risk_role = data.type_of_high_risk_role;
    this.goal = data.goal;
    this.last_updated = data.last_updated;
    this.last_updated_by = data.last_updated_by;
    this.is_demo = data.is_demo;
    this.created_at = data.created_at;
    this.is_organizational = data.is_organizational;
    this.use_case_category = data.use_case_category;
    this.use_case_purpose = data.use_case_purpose;
    this.use_case_audience = data.use_case_audience;
    this.deployment_context = data.deployment_context;
  }

  static createNewProject(data: ProjectModel): ProjectModel {
    return new ProjectModel(data);
  }
}
