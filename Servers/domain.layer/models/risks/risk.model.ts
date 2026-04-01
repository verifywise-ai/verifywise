import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IRisk } from "../../interfaces/I.risk";
import {
  ValidationException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "project_risks",
  timestamps: true,
  underscored: true,
})
export class RiskModel extends Model<RiskModel> implements IRisk {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  risk_name!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  risk_owner!: number;

  @Column({
    type: DataType.ENUM(
      "Problem definition & planning",
      "Data collection & processing",
      "Model development & training",
      "Model validation & testing",
      "Deployment & integration",
      "Monitoring & maintenance",
      "Decommissioning & retirement"
    ),
  })
  ai_lifecycle_phase!:
    | "Problem definition & planning"
    | "Data collection & processing"
    | "Model development & training"
    | "Model validation & testing"
    | "Deployment & integration"
    | "Monitoring & maintenance"
    | "Decommissioning & retirement";

  @Column({
    type: DataType.STRING,
  })
  risk_description!: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
  })
  risk_category!: string[];

  @Column({
    type: DataType.STRING,
  })
  impact!: string;

  @Column({
    type: DataType.STRING,
  })
  assessment_mapping!: string;

  @Column({
    type: DataType.STRING,
  })
  controls_mapping!: string;

  @Column({
    type: DataType.ENUM(
      "Rare",
      "Unlikely",
      "Possible",
      "Likely",
      "Almost Certain"
    ),
  })
  likelihood!: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";

  @Column({
    type: DataType.ENUM(
      "Negligible",
      "Minor",
      "Moderate",
      "Major",
      "Catastrophic"
    ),
  })
  severity!: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";

  @Column({
    type: DataType.ENUM(
      "No risk",
      "Very low risk",
      "Low risk",
      "Medium risk",
      "High risk",
      "Very high risk"
    ),
  })
  risk_level_autocalculated!:
    | "No risk"
    | "Very low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";

  @Column({
    type: DataType.STRING,
  })
  review_notes!: string;

  @Column({
    type: DataType.ENUM(
      "Not Started",
      "In Progress",
      "Completed",
      "On Hold",
      "Deferred",
      "Canceled",
      "Requires review"
    ),
  })
  mitigation_status!:
    | "Not Started"
    | "In Progress"
    | "Completed"
    | "On Hold"
    | "Deferred"
    | "Canceled"
    | "Requires review";

  @Column({
    type: DataType.ENUM(
      "Very Low risk",
      "Low risk",
      "Medium risk",
      "High risk",
      "Very high risk"
    ),
  })
  current_risk_level!:
    | "Very Low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";

  @Column({
    type: DataType.DATE,
  })
  deadline!: Date;

  @Column({
    type: DataType.STRING,
  })
  mitigation_plan!: string;

  @Column({
    type: DataType.STRING,
  })
  implementation_strategy!: string;

  @Column({
    type: DataType.STRING,
  })
  mitigation_evidence_document!: string;

  @Column({
    type: DataType.ENUM(
      "Rare",
      "Unlikely",
      "Possible",
      "Likely",
      "Almost Certain"
    ),
  })
  likelihood_mitigation!:
    | "Rare"
    | "Unlikely"
    | "Possible"
    | "Likely"
    | "Almost Certain";

  @Column({
    type: DataType.ENUM("Negligible", "Minor", "Moderate", "Major", "Critical"),
  })
  risk_severity!: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";

  @Column({
    type: DataType.STRING,
  })
  final_risk_level!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  risk_approval!: number;

  @Column({
    type: DataType.STRING,
  })
  approval_status!: string;

  @Column({
    type: DataType.DATE,
  })
  date_of_assessment!: Date;

  // =============================================
  // Quantitative Risk Assessment (FAIR) Fields
  // =============================================

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true })
  event_frequency_min?: number | null;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true })
  event_frequency_likely?: number | null;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true })
  event_frequency_max?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_regulatory_min?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_regulatory_likely?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_regulatory_max?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_operational_min?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_operational_likely?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_operational_max?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_litigation_min?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_litigation_likely?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_litigation_max?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_reputational_min?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_reputational_likely?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  loss_reputational_max?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  total_loss_likely?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  ale_estimate?: number | null;

  @Column({ type: DataType.DECIMAL(5, 2), allowNull: true })
  control_effectiveness?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  residual_ale?: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  mitigation_cost_annual?: number | null;

  @Column({ type: DataType.DECIMAL(8, 2), allowNull: true })
  roi_percentage?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  benchmark_id?: number | null;

  @Column({ type: DataType.STRING(3), allowNull: true, defaultValue: 'USD' })
  currency?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_deleted?: boolean;

  @Column({
    type: DataType.DATE,
  })
  deleted_at?: Date;

  /**
   * Create a new project risk with validation
   */
  static async createProjectRisk(
    projectRiskData: Partial<IRisk>,
    is_demo: boolean = false
  ): Promise<RiskModel> {
    if (
      !projectRiskData.risk_name ||
      projectRiskData.risk_name.trim().length === 0
    ) {
      throw new ValidationException(
        "Risk name is required",
        "risk_name",
        projectRiskData.risk_name
      );
    }

    if (!projectRiskData.risk_owner || projectRiskData.risk_owner < 1) {
      throw new ValidationException(
        "Valid risk owner is required (must be >= 1)",
        "risk_owner",
        projectRiskData.risk_owner
      );
    }

    if (
      !projectRiskData.risk_description ||
      projectRiskData.risk_description.trim().length === 0
    ) {
      throw new ValidationException(
        "Risk description is required",
        "risk_description",
        projectRiskData.risk_description
      );
    }

    // Create and return the project risk model instance
    const projectRisk = new RiskModel();
    Object.assign(projectRisk, projectRiskData);
    projectRisk.is_demo = is_demo;
    projectRisk.created_at = new Date();

    return projectRisk;
  }

  /**
   * Update project risk with validation
   */
  async updateProjectRisk(updateData: Partial<IRisk>): Promise<void> {
    // Validate risk_name if provided
    if (updateData.risk_name !== undefined) {
      if (!updateData.risk_name || updateData.risk_name.trim().length === 0) {
        throw new ValidationException(
          "Risk name is required",
          "risk_name",
          updateData.risk_name
        );
      }
      this.risk_name = updateData.risk_name.trim();
    }

    // Validate risk_owner if provided
    if (updateData.risk_owner !== undefined) {
      if (!updateData.risk_owner || updateData.risk_owner < 1) {
        throw new ValidationException(
          "Valid risk owner is required (must be >= 1)",
          "risk_owner",
          updateData.risk_owner
        );
      }
      this.risk_owner = updateData.risk_owner;
    }

    // Validate risk_description if provided
    if (updateData.risk_description !== undefined) {
      if (
        !updateData.risk_description ||
        updateData.risk_description.trim().length === 0
      ) {
        throw new ValidationException(
          "Risk description is required",
          "risk_description",
          updateData.risk_description
        );
      }
      this.risk_description = updateData.risk_description.trim();
    }

    // Update other fields if provided
    if (updateData.ai_lifecycle_phase !== undefined) {
      this.ai_lifecycle_phase = updateData.ai_lifecycle_phase;
    }

    if (updateData.risk_category !== undefined) {
      this.risk_category = updateData.risk_category;
    }

    if (updateData.impact !== undefined) {
      this.impact = updateData.impact;
    }

    if (updateData.assessment_mapping !== undefined) {
      this.assessment_mapping = updateData.assessment_mapping;
    }

    if (updateData.controls_mapping !== undefined) {
      this.controls_mapping = updateData.controls_mapping;
    }

    if (updateData.likelihood !== undefined) {
      this.likelihood = updateData.likelihood;
    }

    if (updateData.severity !== undefined) {
      this.severity = updateData.severity;
    }

    if (updateData.risk_level_autocalculated !== undefined) {
      this.risk_level_autocalculated = updateData.risk_level_autocalculated;
    }

    if (updateData.review_notes !== undefined) {
      this.review_notes = updateData.review_notes;
    }

    if (updateData.mitigation_status !== undefined) {
      this.mitigation_status = updateData.mitigation_status;
    }

    if (updateData.current_risk_level !== undefined) {
      this.current_risk_level = updateData.current_risk_level;
    }

    if (updateData.deadline !== undefined) {
      this.deadline = updateData.deadline;
    }

    if (updateData.mitigation_plan !== undefined) {
      this.mitigation_plan = updateData.mitigation_plan;
    }

    if (updateData.implementation_strategy !== undefined) {
      this.implementation_strategy = updateData.implementation_strategy;
    }

    if (updateData.mitigation_evidence_document !== undefined) {
      this.mitigation_evidence_document =
        updateData.mitigation_evidence_document;
    }

    if (updateData.likelihood_mitigation !== undefined) {
      this.likelihood_mitigation = updateData.likelihood_mitigation;
    }

    if (updateData.risk_severity !== undefined) {
      this.risk_severity = updateData.risk_severity;
    }

    if (updateData.final_risk_level !== undefined) {
      this.final_risk_level = updateData.final_risk_level;
    }

    if (updateData.risk_approval !== undefined) {
      this.risk_approval = updateData.risk_approval;
    }

    if (updateData.approval_status !== undefined) {
      this.approval_status = updateData.approval_status;
    }

    if (updateData.date_of_assessment !== undefined) {
      this.date_of_assessment = updateData.date_of_assessment;
    }
  }

  /**
   * Validate project risk data before saving
   */
  async validateProjectRiskData(): Promise<void> {
    if (!this.risk_name || this.risk_name.trim().length === 0) {
      throw new ValidationException(
        "Risk name is required",
        "risk_name",
        this.risk_name
      );
    }

    if (!this.risk_owner || this.risk_owner < 1) {
      throw new ValidationException(
        "Valid risk owner is required (must be >= 1)",
        "risk_owner",
        this.risk_owner
      );
    }

    if (!this.risk_description || this.risk_description.trim().length === 0) {
      throw new ValidationException(
        "Risk description is required",
        "risk_description",
        this.risk_description
      );
    }
  }

  /**
   * Check if this is a demo project risk
   */
  isDemoProjectRisk(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      risk_name: this.risk_name,
      risk_owner: this.risk_owner,
      ai_lifecycle_phase: this.ai_lifecycle_phase,
      risk_description: this.risk_description,
      risk_category: this.risk_category,
      impact: this.impact,
      assessment_mapping: this.assessment_mapping,
      controls_mapping: this.controls_mapping,
      likelihood: this.likelihood,
      severity: this.severity,
      risk_level_autocalculated: this.risk_level_autocalculated,
      review_notes: this.review_notes,
      mitigation_status: this.mitigation_status,
      current_risk_level: this.current_risk_level,
      deadline: this.deadline,
      mitigation_plan: this.mitigation_plan,
      implementation_strategy: this.implementation_strategy,
      mitigation_evidence_document: this.mitigation_evidence_document,
      likelihood_mitigation: this.likelihood_mitigation,
      risk_severity: this.risk_severity,
      final_risk_level: this.final_risk_level,
      risk_approval: this.risk_approval,
      approval_status: this.approval_status,
      date_of_assessment: this.date_of_assessment,
      is_demo: this.is_demo,
      // Quantitative (FAIR) fields
      event_frequency_min: this.event_frequency_min,
      event_frequency_likely: this.event_frequency_likely,
      event_frequency_max: this.event_frequency_max,
      loss_regulatory_min: this.loss_regulatory_min,
      loss_regulatory_likely: this.loss_regulatory_likely,
      loss_regulatory_max: this.loss_regulatory_max,
      loss_operational_min: this.loss_operational_min,
      loss_operational_likely: this.loss_operational_likely,
      loss_operational_max: this.loss_operational_max,
      loss_litigation_min: this.loss_litigation_min,
      loss_litigation_likely: this.loss_litigation_likely,
      loss_litigation_max: this.loss_litigation_max,
      loss_reputational_min: this.loss_reputational_min,
      loss_reputational_likely: this.loss_reputational_likely,
      loss_reputational_max: this.loss_reputational_max,
      total_loss_likely: this.total_loss_likely,
      ale_estimate: this.ale_estimate,
      control_effectiveness: this.control_effectiveness,
      residual_ale: this.residual_ale,
      mitigation_cost_annual: this.mitigation_cost_annual,
      roi_percentage: this.roi_percentage,
      benchmark_id: this.benchmark_id,
      currency: this.currency,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Static method to find project risk by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<RiskModel> {
    if (!id || id < 1) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    const projectRisk = await RiskModel.findByPk(id);
    if (!projectRisk) {
      throw new NotFoundException("Project risk not found", "ProjectRisk", id);
    }

    return projectRisk;
  }

  /**
   * Static method to find project risks by risk owner
   */
  static async findByRiskOwner(riskOwnerId: number): Promise<RiskModel[]> {
    if (!riskOwnerId || riskOwnerId < 1) {
      throw new ValidationException(
        "Valid risk owner ID is required (must be >= 1)",
        "riskOwnerId",
        riskOwnerId
      );
    }

    return await RiskModel.findAll({
      where: { risk_owner: riskOwnerId },
      order: [["created_at", "DESC"]],
    });
  }

  /**
   * Static method to update project risk by ID
   */
  static async updateProjectRiskById(
    id: number,
    updateData: Partial<IRisk>
  ): Promise<[number, RiskModel[]]> {
    if (!id || id < 1) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await RiskModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete project risk by ID
   */
  static async deleteProjectRiskById(id: number): Promise<number> {
    if (!id || id < 1) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await RiskModel.destroy({
      where: { id },
    });
  }

  constructor(init?: Partial<IRisk>) {
    super();
    Object.assign(this, init);
  }
}
