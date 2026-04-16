import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import {
  IMasterControl,
  MasterControlStatus,
  MasterControlRiskReview,
} from "../../interfaces/i.masterControl";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

export const MASTER_CONTROL_STATUSES: readonly MasterControlStatus[] = [
  "Waiting",
  "In progress",
  "Done",
] as const;

export const MASTER_CONTROL_RISK_REVIEWS: readonly MasterControlRiskReview[] = [
  "Acceptable risk",
  "Residual risk",
  "Unacceptable risk",
] as const;

@Table({
  tableName: "master_controls",
  timestamps: true,
  underscored: true,
})
export class MasterControlModel
  extends Model<MasterControlModel>
  implements IMasterControl {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string | null;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: "Waiting",
  })
  status?: MasterControlStatus;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
  })
  risk_review?: MasterControlRiskReview | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  owner?: number | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  reviewer?: number | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  approver?: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  due_date?: Date | string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  implementation_details?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updated_at?: Date;

  /**
   * Factory — build a validated MasterControlModel instance prior to persisting.
   * The `organization_id` is applied by the persistence layer (controller/util)
   * from the authenticated request, so it is intentionally not accepted here.
   */
  static async createNewMasterControl(
    title: string,
    description?: string | null,
    status: MasterControlStatus = "Waiting",
    risk_review?: MasterControlRiskReview | null,
    owner?: number | null,
    reviewer?: number | null,
    approver?: number | null,
    due_date?: Date | string | null,
    implementation_details?: string | null,
    is_demo: boolean = false
  ): Promise<MasterControlModel> {
    if (!title || title.trim().length === 0) {
      throw new ValidationException(
        "Master control title is required",
        "title",
        title
      );
    }
    if (title.trim().length > 255) {
      throw new ValidationException(
        "Master control title must be 255 characters or fewer",
        "title",
        title
      );
    }

    if (status && !MASTER_CONTROL_STATUSES.includes(status)) {
      throw new ValidationException(
        `Invalid status. Allowed: ${MASTER_CONTROL_STATUSES.join(", ")}`,
        "status",
        status
      );
    }

    if (
      risk_review !== undefined &&
      risk_review !== null &&
      !MASTER_CONTROL_RISK_REVIEWS.includes(risk_review)
    ) {
      throw new ValidationException(
        `Invalid risk review. Allowed: ${MASTER_CONTROL_RISK_REVIEWS.join(", ")}`,
        "risk_review",
        risk_review
      );
    }

    MasterControlModel.assertUserRef(owner, "owner");
    MasterControlModel.assertUserRef(reviewer, "reviewer");
    MasterControlModel.assertUserRef(approver, "approver");

    const model = new MasterControlModel();
    model.title = title.trim();
    model.description = description?.trim() || null;
    model.status = status;
    model.risk_review = risk_review ?? null;
    model.owner = owner ?? null;
    model.reviewer = reviewer ?? null;
    model.approver = approver ?? null;
    model.due_date = due_date ?? null;
    model.implementation_details = implementation_details?.trim() || null;
    model.is_demo = is_demo;
    model.created_at = new Date();
    return model;
  }

  /**
   * Apply partial updates to an existing instance with validation.
   */
  async updateMasterControl(updateData: Partial<IMasterControl>): Promise<void> {
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException(
          "Master control title is required",
          "title",
          updateData.title
        );
      }
      this.title = updateData.title.trim();
    }
    if (updateData.description !== undefined) {
      this.description = updateData.description
        ? String(updateData.description).trim()
        : null;
    }
    if (updateData.status !== undefined) {
      if (!MASTER_CONTROL_STATUSES.includes(updateData.status)) {
        throw new ValidationException(
          `Invalid status. Allowed: ${MASTER_CONTROL_STATUSES.join(", ")}`,
          "status",
          updateData.status
        );
      }
      this.status = updateData.status;
    }
    if (updateData.risk_review !== undefined) {
      if (
        updateData.risk_review !== null &&
        !MASTER_CONTROL_RISK_REVIEWS.includes(updateData.risk_review)
      ) {
        throw new ValidationException(
          `Invalid risk review. Allowed: ${MASTER_CONTROL_RISK_REVIEWS.join(", ")}`,
          "risk_review",
          updateData.risk_review
        );
      }
      this.risk_review = updateData.risk_review;
    }
    if (updateData.owner !== undefined) {
      MasterControlModel.assertUserRef(updateData.owner, "owner");
      this.owner = updateData.owner;
    }
    if (updateData.reviewer !== undefined) {
      MasterControlModel.assertUserRef(updateData.reviewer, "reviewer");
      this.reviewer = updateData.reviewer;
    }
    if (updateData.approver !== undefined) {
      MasterControlModel.assertUserRef(updateData.approver, "approver");
      this.approver = updateData.approver;
    }
    if (updateData.due_date !== undefined) {
      this.due_date = updateData.due_date;
    }
    if (updateData.implementation_details !== undefined) {
      this.implementation_details = updateData.implementation_details
        ? String(updateData.implementation_details).trim()
        : null;
    }
  }

  /**
   * Validate current instance state before persisting.
   */
  async validateMasterControlData(): Promise<void> {
    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException(
        "Master control title is required",
        "title",
        this.title
      );
    }
    if (this.status && !MASTER_CONTROL_STATUSES.includes(this.status)) {
      throw new ValidationException(
        `Invalid status: ${this.status}`,
        "status",
        this.status
      );
    }
    if (
      this.risk_review &&
      !MASTER_CONTROL_RISK_REVIEWS.includes(this.risk_review)
    ) {
      throw new ValidationException(
        `Invalid risk review: ${this.risk_review}`,
        "risk_review",
        this.risk_review
      );
    }
  }

  isDemoMasterControl(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Demo master controls are read-only. Throws BusinessLogicException
   * on attempted mutation.
   */
  canBeModified(): boolean {
    if (this.isDemoMasterControl()) {
      throw new BusinessLogicException(
        "Demo master controls cannot be modified",
        "DEMO_MASTER_CONTROL_RESTRICTION",
        { masterControlId: this.id, title: this.title }
      );
    }
    return true;
  }

  isComplete(): boolean {
    return this.status === "Done";
  }

  isInProgress(): boolean {
    return this.status === "In progress";
  }

  isWaiting(): boolean {
    return this.status === "Waiting" || this.status === undefined;
  }

  getSummary(): {
    id: number | undefined;
    title: string;
    status: MasterControlStatus | undefined;
    isDemo: boolean;
  } {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      isDemo: this.isDemoMasterControl(),
    };
  }

  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      status: this.status,
      risk_review: this.risk_review,
      owner: this.owner,
      reviewer: this.reviewer,
      approver: this.approver,
      due_date:
        this.due_date instanceof Date
          ? this.due_date.toISOString()
          : this.due_date ?? null,
      implementation_details: this.implementation_details,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString?.() ?? null,
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString?.() ?? null,
    };
  }

  static fromJSON(json: Partial<IMasterControl>): MasterControlModel {
    return new MasterControlModel(json);
  }

  static async findByIdWithValidation(id: number): Promise<MasterControlModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }
    const found = await MasterControlModel.findByPk(id);
    if (!found) {
      throw new NotFoundException("Master control not found", "MasterControl", id);
    }
    return found;
  }

  private static assertUserRef(
    value: number | null | undefined,
    field: string
  ): void {
    if (value === undefined || value === null) return;
    if (!numberValidation(value, 1)) {
      throw new ValidationException(
        `Valid ${field} user ID is required (must be >= 1)`,
        field,
        value
      );
    }
  }

  constructor(init?: Partial<IMasterControl>) {
    super();
    Object.assign(this, init);
  }
}
