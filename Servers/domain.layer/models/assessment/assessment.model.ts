import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProjectModel } from "../project/project.model";
import { IAssessment } from "../../interfaces/i.assessment";
import { numberValidation } from "../../validations/number.valid";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "assessments",
  timestamps: false,
  underscored: true,
})
export class AssessmentModel extends Model<AssessmentModel> implements IAssessment {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  organization_id?: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  project_id!: number;

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

  /**
   * Create a new assessment with validation
   */
  static async CreateNewAssessment(
    assessmentAttributes: Partial<IAssessment>,
  ): Promise<AssessmentModel> {
    // Validate project_id
    if (!assessmentAttributes.project_id || !numberValidation(assessmentAttributes.project_id, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        assessmentAttributes.project_id,
      );
    }

    // Convert Partial<IAssessment> to Optional<AssessmentModel, NullishPropertiesOf<AssessmentModel>>
    const attributes = assessmentAttributes as any;

    // Set default values
    attributes.is_demo = attributes.is_demo ?? false;
    attributes.created_at = attributes.created_at ?? new Date();

    return await AssessmentModel.create(attributes);
  }

  /**
   * Update an existing assessment with validation
   */
  static async UpdateAssessment(
    assessmentId: number,
    assessmentAttributes: Partial<IAssessment>,
  ): Promise<[number, AssessmentModel[]]> {
    // Validate assessment_id
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    // Validate project_id if provided
    if (
      assessmentAttributes.project_id !== undefined &&
      !numberValidation(assessmentAttributes.project_id, 1)
    ) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        assessmentAttributes.project_id,
      );
    }

    return await AssessmentModel.update(assessmentAttributes, {
      where: {
        id: assessmentId,
      },
      returning: true,
    });
  }

  /**
   * Find assessment by ID with project relationship
   */
  static async FindAssessmentById(assessmentId: number): Promise<AssessmentModel | null> {
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    return await AssessmentModel.findByPk(assessmentId, {
      include: [ProjectModel],
    });
  }

  /**
   * Find all assessments for a project
   */
  static async FindAssessmentsByProjectId(projectId: number): Promise<AssessmentModel[]> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await AssessmentModel.findAll({
      where: {
        project_id: projectId,
      },
      include: [ProjectModel],
      order: [["created_at", "DESC"]],
    });
  }

  /**
   * Delete assessment with validation
   */
  static async DeleteAssessment(assessmentId: number): Promise<number> {
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    return await AssessmentModel.destroy({
      where: {
        id: assessmentId,
      },
    });
  }

  /**
   * Validate assessment data before saving
   */
  async validateAssessmentData(): Promise<void> {
    if (!this.project_id || !numberValidation(this.project_id, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }
  }

  /**
   * Check if assessment is a demo assessment
   */
  isDemoAssessment(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if assessment can be modified by user
   */
  canBeModifiedBy(user: any): boolean {
    // Demo assessments can only be modified by demo users or admins
    if (this.isDemoAssessment()) {
      return user.is_demo || user.role_id === 1;
    }

    // Regular assessments can be modified by any authenticated user
    return true;
  }

  /**
   * Get assessment data without sensitive information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
    };
  }

  /**
   * Create AssessmentModel instance from JSON data
   */
  static fromJSON(json: any): AssessmentModel {
    return new AssessmentModel(json);
  }

  /**
   * Convert assessment model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
    };
  }

  /**
   * Check if assessment is active (not demo or recent)
   */
  isActive(): boolean {
    if (this.isDemoAssessment()) {
      return false;
    }

    // Consider assessment active if created within the last 30 days
    if (this.created_at) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return this.created_at > thirtyDaysAgo;
    }

    return true; // New assessments are considered active
  }

  /**
   * Get assessment age in days
   */
  getAgeInDays(): number {
    if (!this.created_at) {
      return 0;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if assessment is recent (created within specified days)
   */
  isRecent(days: number = 7): boolean {
    return this.getAgeInDays() <= days;
  }

  constructor(init?: Partial<IAssessment>) {
    super();
    Object.assign(this, init);
  }
}
