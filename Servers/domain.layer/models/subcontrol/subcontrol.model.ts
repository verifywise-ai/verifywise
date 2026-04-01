import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { ControlModel } from "../control/control.model";
import { UserModel } from "../user/user.model";
import { ISubcontrol } from "../../interfaces/i.subcontrol";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "subcontrols",
  timestamps: true,
  underscored: true,
})
export class SubcontrolModel
  extends Model<SubcontrolModel>
  implements ISubcontrol
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  title!: string;

  @Column({
    type: DataType.STRING,
  })
  description!: string;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @Column({
    type: DataType.ENUM("Waiting", "In progress", "Done"),
  })
  status?: "Waiting" | "In progress" | "Done";

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  approver?: number;

  @Column({
    type: DataType.ENUM(
      "Acceptable risk",
      "Residual risk",
      "Unacceptable risk"
    ),
  })
  risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk";

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  owner?: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  reviewer?: number;

  @Column({
    type: DataType.DATE,
  })
  due_date?: Date;

  @Column({
    type: DataType.STRING,
  })
  implementation_details?: string;

  @Column({
    type: DataType.STRING,
  })
  evidence_description?: string;

  @Column({
    type: DataType.STRING,
  })
  feedback_description?: string;

  /**
   * Evidence files - now managed via file_entity_links table
   * This property is populated dynamically by the utils layer, not stored in database
   */
  evidence_files?: {
    id: string | number;
    fileName?: string;
    filename?: string;
    project_id?: number;
    uploaded_by?: number;
    uploaded_time?: Date;
  }[];

  /**
   * Feedback files - now managed via file_entity_links table
   * This property is populated dynamically by the utils layer, not stored in database
   */
  feedback_files?: {
    id: string | number;
    fileName?: string;
    filename?: string;
    project_id?: number;
    uploaded_by?: number;
    uploaded_time?: Date;
  }[];

  @ForeignKey(() => ControlModel)
  @Column({
    type: DataType.INTEGER,
  })
  control_id!: number;

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
   * Create a new subcontrol with comprehensive validation
   */
  static async createNewSubcontrol(
    title: string,
    description: string,
    control_id: number,
    order_no?: number,
    status?: "Waiting" | "In progress" | "Done",
    approver?: number,
    risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk",
    owner?: number,
    reviewer?: number,
    due_date?: Date,
    implementation_details?: string,
    evidence_description?: string,
    feedback_description?: string,
    evidence_files?: any[],
    feedback_files?: any[],
    is_demo: boolean = false
  ): Promise<SubcontrolModel> {
    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationException(
        "Subcontrol title is required",
        "title",
        title
      );
    }

    if (!description || description.trim().length === 0) {
      throw new ValidationException(
        "Subcontrol description is required",
        "description",
        description
      );
    }

    // Validate control_id
    if (!numberValidation(control_id, 1)) {
      throw new ValidationException(
        "Valid control_id is required (must be >= 1)",
        "control_id",
        control_id
      );
    }

    // Validate order_no if provided
    if (order_no !== undefined && !numberValidation(order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        order_no
      );
    }

    // Validate approver if provided
    if (approver !== undefined && !numberValidation(approver, 1)) {
      throw new ValidationException(
        "Valid approver ID is required (must be >= 1)",
        "approver",
        approver
      );
    }

    // Validate owner if provided
    if (owner !== undefined && !numberValidation(owner, 1)) {
      throw new ValidationException(
        "Valid owner ID is required (must be >= 1)",
        "owner",
        owner
      );
    }

    // Validate reviewer if provided
    if (reviewer !== undefined && !numberValidation(reviewer, 1)) {
      throw new ValidationException(
        "Valid reviewer ID is required (must be >= 1)",
        "reviewer",
        reviewer
      );
    }

    // Create and return the subcontrol model instance
    const subcontrol = new SubcontrolModel();
    subcontrol.title = title.trim();
    subcontrol.description = description.trim();
    subcontrol.control_id = control_id;
    subcontrol.order_no = order_no;
    subcontrol.status = status || "Waiting";
    subcontrol.approver = approver;
    subcontrol.risk_review = risk_review;
    subcontrol.owner = owner;
    subcontrol.reviewer = reviewer;
    subcontrol.due_date = due_date;
    subcontrol.implementation_details = implementation_details;
    subcontrol.evidence_description = evidence_description;
    subcontrol.feedback_description = feedback_description;
    subcontrol.evidence_files = evidence_files || [];
    subcontrol.feedback_files = feedback_files || [];
    subcontrol.is_demo = is_demo;
    subcontrol.created_at = new Date();

    return subcontrol;
  }

  /**
   * Update subcontrol information with validation
   */
  async updateSubcontrol(updateData: {
    title?: string;
    description?: string;
    order_no?: number;
    status?: "Waiting" | "In progress" | "Done";
    approver?: number;
    risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk";
    owner?: number;
    reviewer?: number;
    due_date?: Date;
    implementation_details?: string;
    evidence_description?: string;
    feedback_description?: string;
    evidence_files?: any[];
    feedback_files?: any[];
  }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException(
          "Subcontrol title is required",
          "title",
          updateData.title
        );
      }
      this.title = updateData.title.trim();
    }

    // Validate description if provided
    if (updateData.description !== undefined) {
      if (
        !updateData.description ||
        updateData.description.trim().length === 0
      ) {
        throw new ValidationException(
          "Subcontrol description is required",
          "description",
          updateData.description
        );
      }
      this.description = updateData.description.trim();
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (!numberValidation(updateData.order_no, 1)) {
        throw new ValidationException(
          "Order number must be a positive integer",
          "order_no",
          updateData.order_no
        );
      }
      this.order_no = updateData.order_no;
    }

    // Validate approver if provided
    if (updateData.approver !== undefined) {
      if (!numberValidation(updateData.approver, 1)) {
        throw new ValidationException(
          "Valid approver ID is required (must be >= 1)",
          "approver",
          updateData.approver
        );
      }
      this.approver = updateData.approver;
    }

    // Validate owner if provided
    if (updateData.owner !== undefined) {
      if (!numberValidation(updateData.owner, 1)) {
        throw new ValidationException(
          "Valid owner ID is required (must be >= 1)",
          "owner",
          updateData.owner
        );
      }
      this.owner = updateData.owner;
    }

    // Validate reviewer if provided
    if (updateData.reviewer !== undefined) {
      if (!numberValidation(updateData.reviewer, 1)) {
        throw new ValidationException(
          "Valid reviewer ID is required (must be >= 1)",
          "reviewer",
          updateData.reviewer
        );
      }
      this.reviewer = updateData.reviewer;
    }

    // Update other fields if provided
    if (updateData.status !== undefined) {
      this.status = updateData.status;
    }

    if (updateData.risk_review !== undefined) {
      this.risk_review = updateData.risk_review;
    }

    if (updateData.due_date !== undefined) {
      this.due_date = updateData.due_date;
    }

    if (updateData.implementation_details !== undefined) {
      this.implementation_details = updateData.implementation_details;
    }

    if (updateData.evidence_description !== undefined) {
      this.evidence_description = updateData.evidence_description;
    }

    if (updateData.feedback_description !== undefined) {
      this.feedback_description = updateData.feedback_description;
    }

    if (updateData.evidence_files !== undefined) {
      this.evidence_files = updateData.evidence_files;
    }

    if (updateData.feedback_files !== undefined) {
      this.feedback_files = updateData.feedback_files;
    }
  }

  /**
   * Validate subcontrol data before saving
   */
  async validateSubcontrolData(): Promise<void> {
    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException(
        "Subcontrol title is required",
        "title",
        this.title
      );
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new ValidationException(
        "Subcontrol description is required",
        "description",
        this.description
      );
    }

    if (!this.control_id || !numberValidation(this.control_id, 1)) {
      throw new ValidationException(
        "Valid control_id is required",
        "control_id",
        this.control_id
      );
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        this.order_no
      );
    }

    if (this.approver !== undefined && !numberValidation(this.approver, 1)) {
      throw new ValidationException(
        "Valid approver ID is required",
        "approver",
        this.approver
      );
    }

    if (this.owner !== undefined && !numberValidation(this.owner, 1)) {
      throw new ValidationException(
        "Valid owner ID is required",
        "owner",
        this.owner
      );
    }

    if (this.reviewer !== undefined && !numberValidation(this.reviewer, 1)) {
      throw new ValidationException(
        "Valid reviewer ID is required",
        "reviewer",
        this.reviewer
      );
    }
  }

  /**
   * Check if subcontrol is a demo subcontrol
   */
  isDemoSubcontrol(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if subcontrol can be modified
   */
  canBeModified(): boolean {
    if (this.isDemoSubcontrol()) {
      throw new BusinessLogicException(
        "Demo subcontrols cannot be modified",
        "DEMO_SUBCONTROL_RESTRICTION",
        { subcontrolId: this.id, controlId: this.control_id }
      );
    }
    return true;
  }

  /**
   * Check if subcontrol is completed
   */
  isCompleted(): boolean {
    return this.status === "Done";
  }

  /**
   * Check if subcontrol is in progress
   */
  isInProgress(): boolean {
    return this.status === "In progress";
  }

  /**
   * Check if subcontrol is waiting
   */
  isWaiting(): boolean {
    return this.status === "Waiting" || !this.status;
  }

  /**
   * Check if subcontrol has acceptable risk
   */
  hasAcceptableRisk(): boolean {
    return this.risk_review === "Acceptable risk";
  }

  /**
   * Check if subcontrol has residual risk
   */
  hasResidualRisk(): boolean {
    return this.risk_review === "Residual risk";
  }

  /**
   * Check if subcontrol has unacceptable risk
   */
  hasUnacceptableRisk(): boolean {
    return this.risk_review === "Unacceptable risk";
  }

  /**
   * Check if subcontrol is overdue
   */
  isOverdue(): boolean {
    if (!this.due_date) return false;
    return new Date() > this.due_date && !this.isCompleted();
  }

  /**
   * Get subcontrol progress percentage
   */
  getProgressPercentage(): number {
    if (this.isCompleted()) {
      return 100;
    }
    if (this.isInProgress()) {
      return 50;
    }
    return 0;
  }

  /**
   * Get subcontrol summary for display
   */
  getSummary(): {
    id: number | undefined;
    title: string;
    status: string;
    progress: number;
    riskReview: string | undefined;
    isOverdue: boolean;
  } {
    return {
      id: this.id,
      title: this.title,
      status: this.status || "Waiting",
      progress: this.getProgressPercentage(),
      riskReview: this.risk_review,
      isOverdue: this.isOverdue(),
    };
  }

  /**
   * Convert subcontrol model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      order_no: this.order_no,
      status: this.status,
      approver: this.approver,
      risk_review: this.risk_review,
      owner: this.owner,
      reviewer: this.reviewer,
      due_date: this.due_date?.toISOString(),
      implementation_details: this.implementation_details,
      evidence_description: this.evidence_description,
      feedback_description: this.feedback_description,
      evidence_files: this.evidence_files,
      feedback_files: this.feedback_files,
      control_id: this.control_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
      progressPercentage: this.getProgressPercentage(),
      isOverdue: this.isOverdue(),
    };
  }

  /**
   * Create SubcontrolModel instance from JSON data
   */
  static fromJSON(json: any): SubcontrolModel {
    return new SubcontrolModel(json);
  }

  /**
   * Static method to find subcontrol by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<SubcontrolModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    const subcontrol = await SubcontrolModel.findByPk(id);
    if (!subcontrol) {
      throw new NotFoundException("Subcontrol not found", "Subcontrol", id);
    }

    return subcontrol;
  }

  /**
   * Static method to find subcontrols by control ID
   */
  static async findByControlId(controlId: number): Promise<SubcontrolModel[]> {
    if (!numberValidation(controlId, 1)) {
      throw new ValidationException(
        "Valid control_id is required (must be >= 1)",
        "control_id",
        controlId
      );
    }

    return await SubcontrolModel.findAll({
      where: { control_id: controlId },
      order: [["order_no", "ASC"]],
    });
  }

  /**
   * Static method to update subcontrol by ID
   */
  static async updateSubcontrolById(
    id: number,
    updateData: Partial<ISubcontrol>
  ): Promise<[number, SubcontrolModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await SubcontrolModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete subcontrol by ID
   */
  static async deleteSubcontrolById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await SubcontrolModel.destroy({
      where: { id },
    });
  }

  constructor(init?: Partial<ISubcontrol>) {
    super();
    Object.assign(this, init);
  }
}
