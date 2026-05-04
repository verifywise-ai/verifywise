import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IProjectScope } from "../../interfaces/i.projectScope";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "project_scopes",
  timestamps: true,
  underscored: true,
})
export class ProjectScopeModel extends Model<ProjectScopeModel> implements IProjectScope {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    field: "assessment_id",
  })
  assessmentId!: number;

  @Column({
    type: DataType.STRING,
    field: "describe_ai_environment",
  })
  describeAiEnvironment!: string;

  @Column({
    type: DataType.BOOLEAN,
    field: "is_new_ai_technology",
  })
  isNewAiTechnology!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    field: "uses_personal_data",
  })
  usesPersonalData!: boolean;

  @Column({
    type: DataType.STRING,
    field: "project_scope_documents",
  })
  projectScopeDocuments!: string;

  @Column({
    type: DataType.STRING,
    field: "technology_type",
  })
  technologyType!: string;

  @Column({
    type: DataType.BOOLEAN,
    field: "has_ongoing_monitoring",
  })
  hasOngoingMonitoring!: boolean;

  @Column({
    type: DataType.STRING,
    field: "unintended_outcomes",
  })
  unintendedOutcomes!: string;

  @Column({
    type: DataType.STRING,
    field: "technology_documentation",
  })
  technologyDocumentation!: string;

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

  /**
   * Create a new project scope with comprehensive validation
   */
  static async createNewProjectScope(
    assessmentId: number,
    describeAiEnvironment: string,
    isNewAiTechnology: boolean,
    usesPersonalData: boolean,
    projectScopeDocuments: string,
    technologyType: string,
    hasOngoingMonitoring: boolean,
    unintendedOutcomes: string,
    technologyDocumentation: string,
    is_demo: boolean = false,
  ): Promise<ProjectScopeModel> {
    // Validate assessment_id
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    // Validate describeAiEnvironment
    if (!describeAiEnvironment || describeAiEnvironment.trim().length === 0) {
      throw new ValidationException(
        "AI environment description is required",
        "describeAiEnvironment",
        describeAiEnvironment,
      );
    }

    if (describeAiEnvironment.trim().length < 10) {
      throw new ValidationException(
        "AI environment description must be at least 10 characters long",
        "describeAiEnvironment",
        describeAiEnvironment,
      );
    }

    // Validate projectScopeDocuments
    if (!projectScopeDocuments || projectScopeDocuments.trim().length === 0) {
      throw new ValidationException(
        "Project scope documents are required",
        "projectScopeDocuments",
        projectScopeDocuments,
      );
    }

    // Validate technologyType
    if (!technologyType || technologyType.trim().length === 0) {
      throw new ValidationException(
        "Technology type is required",
        "technologyType",
        technologyType,
      );
    }

    if (technologyType.trim().length < 3) {
      throw new ValidationException(
        "Technology type must be at least 3 characters long",
        "technologyType",
        technologyType,
      );
    }

    // Validate unintendedOutcomes
    if (!unintendedOutcomes || unintendedOutcomes.trim().length === 0) {
      throw new ValidationException(
        "Unintended outcomes description is required",
        "unintendedOutcomes",
        unintendedOutcomes,
      );
    }

    // Validate technologyDocumentation
    if (!technologyDocumentation || technologyDocumentation.trim().length === 0) {
      throw new ValidationException(
        "Technology documentation is required",
        "technologyDocumentation",
        technologyDocumentation,
      );
    }

    // Create and return the project scope model instance
    const projectScope = new ProjectScopeModel();
    projectScope.assessmentId = assessmentId;
    projectScope.describeAiEnvironment = describeAiEnvironment.trim();
    projectScope.isNewAiTechnology = isNewAiTechnology;
    projectScope.usesPersonalData = usesPersonalData;
    projectScope.projectScopeDocuments = projectScopeDocuments.trim();
    projectScope.technologyType = technologyType.trim();
    projectScope.hasOngoingMonitoring = hasOngoingMonitoring;
    projectScope.unintendedOutcomes = unintendedOutcomes.trim();
    projectScope.technologyDocumentation = technologyDocumentation.trim();
    projectScope.is_demo = is_demo;
    projectScope.created_at = new Date();

    return projectScope;
  }

  /**
   * Update project scope information with validation
   */
  async updateProjectScope(updateData: {
    describeAiEnvironment?: string;
    isNewAiTechnology?: boolean;
    usesPersonalData?: boolean;
    projectScopeDocuments?: string;
    technologyType?: string;
    hasOngoingMonitoring?: boolean;
    unintendedOutcomes?: string;
    technologyDocumentation?: string;
  }): Promise<void> {
    // Validate describeAiEnvironment if provided
    if (updateData.describeAiEnvironment !== undefined) {
      if (
        !updateData.describeAiEnvironment ||
        updateData.describeAiEnvironment.trim().length === 0
      ) {
        throw new ValidationException(
          "AI environment description is required",
          "describeAiEnvironment",
          updateData.describeAiEnvironment,
        );
      }
      if (updateData.describeAiEnvironment.trim().length < 10) {
        throw new ValidationException(
          "AI environment description must be at least 10 characters long",
          "describeAiEnvironment",
          updateData.describeAiEnvironment,
        );
      }
      this.describeAiEnvironment = updateData.describeAiEnvironment.trim();
    }

    // Validate projectScopeDocuments if provided
    if (updateData.projectScopeDocuments !== undefined) {
      if (
        !updateData.projectScopeDocuments ||
        updateData.projectScopeDocuments.trim().length === 0
      ) {
        throw new ValidationException(
          "Project scope documents are required",
          "projectScopeDocuments",
          updateData.projectScopeDocuments,
        );
      }
      this.projectScopeDocuments = updateData.projectScopeDocuments.trim();
    }

    // Validate technologyType if provided
    if (updateData.technologyType !== undefined) {
      if (!updateData.technologyType || updateData.technologyType.trim().length === 0) {
        throw new ValidationException(
          "Technology type is required",
          "technologyType",
          updateData.technologyType,
        );
      }
      if (updateData.technologyType.trim().length < 3) {
        throw new ValidationException(
          "Technology type must be at least 3 characters long",
          "technologyType",
          updateData.technologyType,
        );
      }
      this.technologyType = updateData.technologyType.trim();
    }

    // Validate unintendedOutcomes if provided
    if (updateData.unintendedOutcomes !== undefined) {
      if (!updateData.unintendedOutcomes || updateData.unintendedOutcomes.trim().length === 0) {
        throw new ValidationException(
          "Unintended outcomes description is required",
          "unintendedOutcomes",
          updateData.unintendedOutcomes,
        );
      }
      this.unintendedOutcomes = updateData.unintendedOutcomes.trim();
    }

    // Validate technologyDocumentation if provided
    if (updateData.technologyDocumentation !== undefined) {
      if (
        !updateData.technologyDocumentation ||
        updateData.technologyDocumentation.trim().length === 0
      ) {
        throw new ValidationException(
          "Technology documentation is required",
          "technologyDocumentation",
          updateData.technologyDocumentation,
        );
      }
      this.technologyDocumentation = updateData.technologyDocumentation.trim();
    }

    // Update boolean fields if provided
    if (updateData.isNewAiTechnology !== undefined) {
      this.isNewAiTechnology = updateData.isNewAiTechnology;
    }

    if (updateData.usesPersonalData !== undefined) {
      this.usesPersonalData = updateData.usesPersonalData;
    }

    if (updateData.hasOngoingMonitoring !== undefined) {
      this.hasOngoingMonitoring = updateData.hasOngoingMonitoring;
    }
  }

  /**
   * Validate project scope data before saving
   */
  async validateProjectScopeData(): Promise<void> {
    if (!this.assessmentId || !numberValidation(this.assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        this.assessmentId,
      );
    }

    if (!this.describeAiEnvironment || this.describeAiEnvironment.trim().length === 0) {
      throw new ValidationException(
        "AI environment description is required",
        "describeAiEnvironment",
        this.describeAiEnvironment,
      );
    }

    if (this.describeAiEnvironment.trim().length < 10) {
      throw new ValidationException(
        "AI environment description must be at least 10 characters long",
        "describeAiEnvironment",
        this.describeAiEnvironment,
      );
    }

    if (!this.projectScopeDocuments || this.projectScopeDocuments.trim().length === 0) {
      throw new ValidationException(
        "Project scope documents are required",
        "projectScopeDocuments",
        this.projectScopeDocuments,
      );
    }

    if (!this.technologyType || this.technologyType.trim().length === 0) {
      throw new ValidationException(
        "Technology type is required",
        "technologyType",
        this.technologyType,
      );
    }

    if (this.technologyType.trim().length < 3) {
      throw new ValidationException(
        "Technology type must be at least 3 characters long",
        "technologyType",
        this.technologyType,
      );
    }

    if (!this.unintendedOutcomes || this.unintendedOutcomes.trim().length === 0) {
      throw new ValidationException(
        "Unintended outcomes description is required",
        "unintendedOutcomes",
        this.unintendedOutcomes,
      );
    }

    if (!this.technologyDocumentation || this.technologyDocumentation.trim().length === 0) {
      throw new ValidationException(
        "Technology documentation is required",
        "technologyDocumentation",
        this.technologyDocumentation,
      );
    }
  }

  /**
   * Check if project scope is a demo scope
   */
  isDemoScope(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if project scope can be modified
   */
  canBeModified(): boolean {
    if (this.isDemoScope()) {
      throw new BusinessLogicException(
        "Demo project scopes cannot be modified",
        "DEMO_SCOPE_RESTRICTION",
        { scopeId: this.id, assessmentId: this.assessmentId },
      );
    }
    return true;
  }

  /**
   * Check if project scope uses personal data
   */
  usesPersonalDataFlag(): boolean {
    return this.usesPersonalData;
  }

  /**
   * Check if project scope has ongoing monitoring
   */
  hasOngoingMonitoringFlag(): boolean {
    return this.hasOngoingMonitoring;
  }

  /**
   * Check if project scope involves new AI technology
   */
  involvesNewAiTechnology(): boolean {
    return this.isNewAiTechnology;
  }

  /**
   * Get project scope risk level based on characteristics
   */
  getRiskLevel(): "High" | "Medium" | "Low" {
    let riskScore = 0;

    // New AI technology increases risk
    if (this.isNewAiTechnology) {
      riskScore += 2;
    }

    // Personal data usage increases risk
    if (this.usesPersonalData) {
      riskScore += 2;
    }

    // No ongoing monitoring increases risk
    if (!this.hasOngoingMonitoring) {
      riskScore += 1;
    }

    // Determine risk level based on score
    if (riskScore >= 3) {
      return "High";
    } else if (riskScore >= 1) {
      return "Medium";
    } else {
      return "Low";
    }
  }

  /**
   * Get project scope summary for display
   */
  getSummary(): {
    id: number | undefined;
    assessmentId: number;
    technologyType: string;
    riskLevel: string;
    usesPersonalData: boolean;
    hasOngoingMonitoring: boolean;
  } {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      technologyType: this.technologyType,
      riskLevel: this.getRiskLevel(),
      usesPersonalData: this.usesPersonalData,
      hasOngoingMonitoring: this.hasOngoingMonitoring,
    };
  }

  /**
   * Get project scope data without sensitive information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      technologyType: this.technologyType,
      riskLevel: this.getRiskLevel(),
      usesPersonalData: this.usesPersonalData,
      hasOngoingMonitoring: this.hasOngoingMonitoring,
      isNewAiTechnology: this.isNewAiTechnology,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      is_demo: this.is_demo,
    };
  }

  /**
   * Convert project scope model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      describeAiEnvironment: this.describeAiEnvironment,
      isNewAiTechnology: this.isNewAiTechnology,
      usesPersonalData: this.usesPersonalData,
      projectScopeDocuments: this.projectScopeDocuments,
      technologyType: this.technologyType,
      hasOngoingMonitoring: this.hasOngoingMonitoring,
      unintendedOutcomes: this.unintendedOutcomes,
      technologyDocumentation: this.technologyDocumentation,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      is_demo: this.is_demo,
      riskLevel: this.getRiskLevel(),
    };
  }

  /**
   * Create ProjectScopeModel instance from JSON data
   */
  static fromJSON(json: any): ProjectScopeModel {
    return new ProjectScopeModel(json);
  }

  /**
   * Static method to find project scope by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<ProjectScopeModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const projectScope = await ProjectScopeModel.findByPk(id);
    if (!projectScope) {
      throw new NotFoundException("Project scope not found", "ProjectScope", id);
    }

    return projectScope;
  }

  /**
   * Static method to find project scope by assessment ID
   */
  static async findByAssessmentId(assessmentId: number): Promise<ProjectScopeModel | null> {
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    return await ProjectScopeModel.findOne({
      where: { assessmentId },
    });
  }

  /**
   * Static method to update project scope by ID
   */
  static async updateProjectScopeById(
    id: number,
    updateData: Partial<IProjectScope>,
  ): Promise<[number, ProjectScopeModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await ProjectScopeModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete project scope by ID
   */
  static async deleteProjectScopeById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await ProjectScopeModel.destroy({
      where: { id },
    });
  }

  /**
   * Check if project scope requires special attention
   */
  requiresSpecialAttention(): boolean {
    return (
      this.isNewAiTechnology ||
      this.usesPersonalData ||
      !this.hasOngoingMonitoring ||
      this.getRiskLevel() === "High"
    );
  }

  /**
   * Get compliance requirements based on scope characteristics
   */
  getComplianceRequirements(): string[] {
    const requirements: string[] = [];

    if (this.usesPersonalData) {
      requirements.push("GDPR compliance required");
      requirements.push("Data protection impact assessment needed");
    }

    if (this.isNewAiTechnology) {
      requirements.push("AI risk assessment required");
      requirements.push("Technology validation needed");
    }

    if (!this.hasOngoingMonitoring) {
      requirements.push("Monitoring implementation required");
    }

    if (this.getRiskLevel() === "High") {
      requirements.push("Enhanced oversight required");
      requirements.push("Regular risk reviews needed");
    }

    return requirements;
  }

  constructor(init?: Partial<IProjectScope>) {
    super();
    Object.assign(this, init);
  }
}
