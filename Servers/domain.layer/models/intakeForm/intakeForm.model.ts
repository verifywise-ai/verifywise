import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IntakeFormStatus } from "../../enums/intake-form-status.enum";
import { IntakeEntityType } from "../../enums/intake-entity-type.enum";
import {
  IIntakeForm,
  IIntakeFormSchema,
  ICreateIntakeFormInput,
  IPublicIntakeForm,
} from "../../interfaces/i.intakeForm";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "intake_forms",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class IntakeFormModel extends Model<IntakeFormModel> implements IIntakeForm {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    unique: true,
  })
  slug!: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    field: "entity_type",
  })
  entityType!: IntakeEntityType;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: { version: "1.0", fields: [] },
    field: "schema",
  })
  schema!: IIntakeFormSchema;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    defaultValue: "Submit",
    field: "submit_button_text",
  })
  submitButtonText!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: IntakeFormStatus.DRAFT,
  })
  status!: IntakeFormStatus;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: "ttl_expires_at",
  })
  ttlExpiresAt!: Date | null;

  @Column({
    type: DataType.STRING(8),
    allowNull: true,
    unique: true,
    field: "public_id",
  })
  publicId!: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  recipients!: number[];

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "eu_ai_act",
    field: "risk_tier_system",
  })
  riskTierSystem!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    field: "risk_assessment_config",
  })
  riskAssessmentConfig!: Record<string, unknown> | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    field: "llm_key_id",
  })
  llmKeyId!: number | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: "suggested_questions_enabled",
  })
  suggestedQuestionsEnabled!: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    field: "design_settings",
  })
  designSettings!: Record<string, unknown> | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: "created_by",
  })
  createdBy!: number;

  @Column({
    type: DataType.DATE,
    field: "created_at",
  })
  createdAt!: Date;

  @Column({
    type: DataType.DATE,
    field: "updated_at",
  })
  updatedAt!: Date;

  /**
   * Validate form data before saving
   */
  async validateFormData(): Promise<void> {
    if (!this.name?.trim()) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (!this.description?.trim()) {
      throw new ValidationException(
        "Description is required",
        "description",
        this.description
      );
    }

    if (!this.slug?.trim()) {
      throw new ValidationException("Slug is required", "slug", this.slug);
    }

    if (!Object.values(IntakeEntityType).includes(this.entityType)) {
      throw new ValidationException(
        "Invalid entity type",
        "entityType",
        this.entityType
      );
    }

    if (!this.createdBy) {
      throw new ValidationException(
        "Created by is required",
        "createdBy",
        this.createdBy
      );
    }
  }

  /**
   * Check if form is active and not expired
   */
  isActiveAndValid(): boolean {
    if (this.status !== IntakeFormStatus.ACTIVE) {
      return false;
    }

    if (this.ttlExpiresAt && new Date() > this.ttlExpiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Check if form is expired
   */
  isExpired(): boolean {
    if (!this.ttlExpiresAt) {
      return false;
    }
    return new Date() > this.ttlExpiresAt;
  }

  /**
   * Check if form is draft
   */
  isDraft(): boolean {
    return this.status === IntakeFormStatus.DRAFT;
  }

  /**
   * Check if form is active
   */
  isActive(): boolean {
    return this.status === IntakeFormStatus.ACTIVE;
  }

  /**
   * Check if form is archived
   */
  isArchived(): boolean {
    return this.status === IntakeFormStatus.ARCHIVED;
  }

  /**
   * Get public form data (for unauthenticated users)
   */
  toPublicJSON(): IPublicIntakeForm {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      slug: this.slug,
      entityType: this.entityType,
      schema: this.schema,
      submitButtonText: this.submitButtonText,
      publicId: this.publicId,
      designSettings: this.designSettings,
    };
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): IIntakeForm {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      slug: this.slug,
      entityType: this.entityType,
      schema: this.schema,
      submitButtonText: this.submitButtonText,
      status: this.status,
      ttlExpiresAt: this.ttlExpiresAt,
      publicId: this.publicId,
      recipients: this.recipients,
      riskTierSystem: this.riskTierSystem,
      riskAssessmentConfig: this.riskAssessmentConfig,
      llmKeyId: this.llmKeyId,
      suggestedQuestionsEnabled: this.suggestedQuestionsEnabled,
      designSettings: this.designSettings,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Create a new IntakeFormModel instance
   */
  static createNewForm(data: ICreateIntakeFormInput): IntakeFormModel {
    const form = new IntakeFormModel({
      name: data.name,
      description: data.description,
      slug: data.slug || IntakeFormModel.generateSlug(data.name),
      entityType: data.entityType,
      schema: data.schema || { version: "1.0", fields: [] },
      submitButtonText: data.submitButtonText || "Submit",
      status: data.status || IntakeFormStatus.DRAFT,
      ttlExpiresAt: data.ttlExpiresAt || null,
      createdBy: data.createdBy,
    });

    return form;
  }

  /**
   * Generate slug from name
   */
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Update form status
   */
  async updateStatus(newStatus: IntakeFormStatus): Promise<void> {
    if (!Object.values(IntakeFormStatus).includes(newStatus)) {
      throw new ValidationException("Invalid status value", "status", newStatus);
    }

    this.status = newStatus;
    this.updatedAt = new Date();
  }

  constructor(init?: Partial<IIntakeForm>) {
    super();
    Object.assign(this, init);
  }
}
