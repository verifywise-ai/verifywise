import { AiLifeCyclePhase } from "../../../enums/aiLifeCyclePhase.enum";
import { CurrentRiskLevel } from "../../../enums/currentRiskLevel.enum";
import { Likelihood } from "../../../enums/likelihood.enum";
import { MitigationStatus } from "../../../enums/mitigitaion";
import { RiskLevelAutoCalculated } from "../../../enums/riskLevelAutoCalculated.enum";
import { RiskSeverity } from "../../../enums/riskSeverity.enum";
import { Severity } from "../../../enums/severity.enum";

export class RiskModel {
  id?: number;
  risk_name!: string;
  risk_owner!: number;
  ai_lifecycle_phase!: AiLifeCyclePhase;
  risk_description!: string;
  risk_category!: string[];
  impact!: string;
  assessment_mapping!: string;
  controls_mapping!: string;
  likelihood!: Likelihood;
  severity!: Severity;
  risk_level_autocalculated!: RiskLevelAutoCalculated;
  review_notes!: string;
  mitigation_status!: MitigationStatus;
  current_risk_level!: CurrentRiskLevel;
  deadline!: Date;
  mitigation_plan!: string;
  implementation_strategy!: string;
  mitigation_evidence_document!: string;
  likelihood_mitigation!: Likelihood;
  risk_severity!: RiskSeverity;
  final_risk_level!: string;
  risk_approval!: number;
  approval_status!: string;
  date_of_assessment!: Date;
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;
  is_deleted?: boolean;
  deleted_at?: Date;

  // Quantitative risk assessment (FAIR) fields
  event_frequency_min?: number | null;
  event_frequency_likely?: number | null;
  event_frequency_max?: number | null;
  loss_regulatory_min?: number | null;
  loss_regulatory_likely?: number | null;
  loss_regulatory_max?: number | null;
  loss_operational_min?: number | null;
  loss_operational_likely?: number | null;
  loss_operational_max?: number | null;
  loss_litigation_min?: number | null;
  loss_litigation_likely?: number | null;
  loss_litigation_max?: number | null;
  loss_reputational_min?: number | null;
  loss_reputational_likely?: number | null;
  loss_reputational_max?: number | null;
  total_loss_likely?: number | null;
  ale_estimate?: number | null;
  control_effectiveness?: number | null;
  residual_ale?: number | null;
  mitigation_cost_annual?: number | null;
  roi_percentage?: number | null;
  benchmark_id?: number | null;
  currency?: string | null;

  constructor(data: RiskModel) {
    this.id = data.id;
    this.risk_name = data.risk_name;
    this.risk_owner = data.risk_owner;
    this.ai_lifecycle_phase = data.ai_lifecycle_phase;
    this.risk_description = data.risk_description;
    this.risk_category = data.risk_category;
    this.impact = data.impact;
    this.assessment_mapping = data.assessment_mapping;
    this.controls_mapping = data.controls_mapping;
    this.likelihood = data.likelihood;
    this.severity = data.severity;
    this.risk_level_autocalculated = data.risk_level_autocalculated;
    this.review_notes = data.review_notes;
    this.mitigation_status = data.mitigation_status;
    this.current_risk_level = data.current_risk_level;
    this.deadline = data.deadline;
    this.mitigation_plan = data.mitigation_plan;
    this.implementation_strategy = data.implementation_strategy;
    this.mitigation_evidence_document = data.mitigation_evidence_document;
    this.likelihood_mitigation = data.likelihood_mitigation;
    this.risk_severity = data.risk_severity;
    this.final_risk_level = data.final_risk_level;
    this.risk_approval = data.risk_approval;
    this.approval_status = data.approval_status;
    this.date_of_assessment = data.date_of_assessment;
    this.is_demo = data.is_demo;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.is_deleted = data.is_deleted;
    this.deleted_at = data.deleted_at;

    // FAIR fields
    this.event_frequency_min = data.event_frequency_min;
    this.event_frequency_likely = data.event_frequency_likely;
    this.event_frequency_max = data.event_frequency_max;
    this.loss_regulatory_min = data.loss_regulatory_min;
    this.loss_regulatory_likely = data.loss_regulatory_likely;
    this.loss_regulatory_max = data.loss_regulatory_max;
    this.loss_operational_min = data.loss_operational_min;
    this.loss_operational_likely = data.loss_operational_likely;
    this.loss_operational_max = data.loss_operational_max;
    this.loss_litigation_min = data.loss_litigation_min;
    this.loss_litigation_likely = data.loss_litigation_likely;
    this.loss_litigation_max = data.loss_litigation_max;
    this.loss_reputational_min = data.loss_reputational_min;
    this.loss_reputational_likely = data.loss_reputational_likely;
    this.loss_reputational_max = data.loss_reputational_max;
    this.total_loss_likely = data.total_loss_likely;
    this.ale_estimate = data.ale_estimate;
    this.control_effectiveness = data.control_effectiveness;
    this.residual_ale = data.residual_ale;
    this.mitigation_cost_annual = data.mitigation_cost_annual;
    this.roi_percentage = data.roi_percentage;
    this.benchmark_id = data.benchmark_id;
    this.currency = data.currency;
  }

  static createNewRisk(data: RiskModel): RiskModel {
    return new RiskModel(data);
  }
}
