import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IntakeSubmissionStatus } from "../../enums/intake-submission-status.enum";
import { IntakeEntityType } from "../../enums/intake-entity-type.enum";
import {
  IIntakeSubmission,
  IntakeSubmissionData,
  ICreateIntakeSubmissionInput,
  IRiskAssessment,
  IRiskOverride,
} from "../../interfaces/i.intakeSubmission";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "intake_submissions",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class IntakeSubmissionModel
  extends Model<IntakeSubmissionModel>
  implements IIntakeSubmission
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: "form_id",
  })
  formId!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    field: "submitter_email",
  })
  submitterEmail!: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    field: "submitter_name",
  })
  submitterName!: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  data!: IntakeSubmissionData;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    field: "entity_type",
  })
  entityType!: IntakeEntityType;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    field: "entity_id",
  })
  entityId!: number | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: IntakeSubmissionStatus.PENDING,
  })
  status!: IntakeSubmissionStatus;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: "rejection_reason",
  })
  rejectionReason!: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    field: "reviewed_by",
  })
  reviewedBy!: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: "reviewed_at",
  })
  reviewedAt!: Date | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    field: "original_submission_id",
  })
  originalSubmissionId!: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: "resubmission_count",
  })
  resubmissionCount!: number;

  @Column({
    type: DataType.STRING(45),
    allowNull: true,
    field: "ip_address",
  })
  ipAddress!: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    field: "risk_assessment",
  })
  riskAssessment!: IRiskAssessment | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    field: "risk_tier",
  })
  riskTier!: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    field: "risk_override",
  })
  riskOverride!: IRiskOverride | null;

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
   * Validate submission data before saving
   */
  async validateSubmissionData(requireContactInfo = true): Promise<void> {
    if (!this.formId) {
      throw new ValidationException("Form ID is required", "formId", this.formId);
    }

    if (requireContactInfo) {
      if (!this.submitterEmail?.trim()) {
        throw new ValidationException(
          "Submitter email is required",
          "submitterEmail",
          this.submitterEmail,
        );
      }

      if (!this.submitterName?.trim()) {
        throw new ValidationException(
          "Submitter name is required",
          "submitterName",
          this.submitterName,
        );
      }
    }

    if (!Object.values(IntakeEntityType).includes(this.entityType)) {
      throw new ValidationException("Invalid entity type", "entityType", this.entityType);
    }
  }

  /**
   * Check if submission is pending
   */
  isPending(): boolean {
    return this.status === IntakeSubmissionStatus.PENDING;
  }

  /**
   * Check if submission is approved
   */
  isApproved(): boolean {
    return this.status === IntakeSubmissionStatus.APPROVED;
  }

  /**
   * Check if submission is rejected
   */
  isRejected(): boolean {
    return this.status === IntakeSubmissionStatus.REJECTED;
  }

  /**
   * Check if this is a resubmission
   */
  isResubmission(): boolean {
    return this.originalSubmissionId !== null;
  }

  /**
   * Approve the submission
   */
  async approve(reviewedBy: number, entityId: number): Promise<void> {
    this.status = IntakeSubmissionStatus.APPROVED;
    this.reviewedBy = reviewedBy;
    this.reviewedAt = new Date();
    this.entityId = entityId;
    this.updatedAt = new Date();
  }

  /**
   * Reject the submission
   */
  async reject(reviewedBy: number, reason: string): Promise<void> {
    if (!reason?.trim()) {
      throw new ValidationException("Rejection reason is required", "rejectionReason", reason);
    }

    this.status = IntakeSubmissionStatus.REJECTED;
    this.reviewedBy = reviewedBy;
    this.reviewedAt = new Date();
    this.rejectionReason = reason;
    this.updatedAt = new Date();
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): IIntakeSubmission {
    return {
      id: this.id,
      formId: this.formId,
      submitterEmail: this.submitterEmail,
      submitterName: this.submitterName,
      data: this.data,
      entityType: this.entityType,
      entityId: this.entityId,
      status: this.status,
      rejectionReason: this.rejectionReason,
      reviewedBy: this.reviewedBy,
      reviewedAt: this.reviewedAt,
      originalSubmissionId: this.originalSubmissionId,
      resubmissionCount: this.resubmissionCount,
      ipAddress: this.ipAddress,
      riskAssessment: this.riskAssessment,
      riskTier: this.riskTier,
      riskOverride: this.riskOverride,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Create a new IntakeSubmissionModel instance
   */
  static createNewSubmission(data: ICreateIntakeSubmissionInput): IntakeSubmissionModel {
    const submission = new IntakeSubmissionModel({
      formId: data.formId,
      submitterEmail: data.submitterEmail,
      submitterName: data.submitterName,
      data: data.data,
      entityType: data.entityType,
      status: IntakeSubmissionStatus.PENDING,
      originalSubmissionId: data.originalSubmissionId || null,
      resubmissionCount: data.originalSubmissionId ? 1 : 0,
      ipAddress: data.ipAddress || null,
    });

    return submission;
  }

  constructor(init?: Partial<IIntakeSubmission>) {
    super();
    Object.assign(this, init);
  }
}
