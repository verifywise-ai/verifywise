import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { FriaStatus, FriaRiskLevel } from "../../enums/fria-status.enum";
import { IFriaAssessment, IFriaAssessmentJSON } from "../../interfaces/i.fria";

@Table({
  tableName: "fria_assessments",
  timestamps: true,
  underscored: true,
})
export class FriaAssessmentModel
  extends Model<FriaAssessmentModel>
  implements IFriaAssessment
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  project_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  version!: number;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: FriaStatus.DRAFT,
  })
  status!: FriaStatus;

  // Section 1
  @Column({ type: DataType.STRING(255), allowNull: true })
  assessment_owner?: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  assessment_date?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  operational_context?: string;

  // Section 2
  @Column({ type: DataType.STRING(30), allowNull: true })
  is_high_risk?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  high_risk_basis?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  deployer_type?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  annex_iii_category?: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  first_use_date?: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  review_cycle?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  period_frequency?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  fria_rationale?: string;

  // Section 3
  @Column({ type: DataType.TEXT, allowNull: true })
  affected_groups?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  vulnerability_context?: string;

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: [] })
  group_flags?: string[];

  // Section 5
  @Column({ type: DataType.TEXT, allowNull: true })
  risk_scenarios?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  provider_info_used?: string;

  // Section 6
  @Column({ type: DataType.TEXT, allowNull: true })
  human_oversight?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  transparency_measures?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  redress_process?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  data_governance?: string;

  // Section 7
  @Column({ type: DataType.STRING(20), allowNull: true })
  legal_review?: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  dpo_review?: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  owner_approval?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  stakeholders_consulted?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  consultation_notes?: string;

  // Section 8
  @Column({ type: DataType.STRING(50), allowNull: true })
  deployment_decision?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  decision_conditions?: string;

  // Computed
  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  completion_pct!: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  risk_score!: number;

  @Column({ type: DataType.STRING(10), defaultValue: FriaRiskLevel.LOW })
  risk_level!: FriaRiskLevel;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  rights_flagged!: number;

  // Metadata
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  created_by!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: true })
  updated_by?: number;

  @Column({ type: DataType.DATE, allowNull: true })
  created_at?: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  updated_at?: Date;

  toSafeJSON(): IFriaAssessmentJSON {
    return {
      id: this.id,
      organization_id: this.organization_id,
      project_id: this.project_id,
      version: this.version,
      status: this.status,
      assessment_owner: this.assessment_owner,
      assessment_date: this.assessment_date,
      operational_context: this.operational_context,
      is_high_risk: this.is_high_risk,
      high_risk_basis: this.high_risk_basis,
      deployer_type: this.deployer_type,
      annex_iii_category: this.annex_iii_category,
      first_use_date: this.first_use_date,
      review_cycle: this.review_cycle,
      period_frequency: this.period_frequency,
      fria_rationale: this.fria_rationale,
      affected_groups: this.affected_groups,
      vulnerability_context: this.vulnerability_context,
      group_flags: this.group_flags,
      risk_scenarios: this.risk_scenarios,
      provider_info_used: this.provider_info_used,
      human_oversight: this.human_oversight,
      transparency_measures: this.transparency_measures,
      redress_process: this.redress_process,
      data_governance: this.data_governance,
      legal_review: this.legal_review,
      dpo_review: this.dpo_review,
      owner_approval: this.owner_approval,
      stakeholders_consulted: this.stakeholders_consulted,
      consultation_notes: this.consultation_notes,
      deployment_decision: this.deployment_decision,
      decision_conditions: this.decision_conditions,
      completion_pct: this.completion_pct,
      risk_score: this.risk_score,
      risk_level: this.risk_level,
      rights_flagged: this.rights_flagged,
      created_by: this.created_by,
      updated_by: this.updated_by,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
