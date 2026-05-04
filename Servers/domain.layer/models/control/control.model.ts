import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ControlCategoryModel } from "../controlCategory/controlCategory.model";
import { IControl } from "../../interfaces/i.control";
import { numberValidation } from "../../validations/number.valid";
import { ValidationException, BusinessLogicException } from "../../exceptions/custom.exception";

@Table({
  tableName: "controls",
  timestamps: true,
  underscored: true,
})
export class ControlModel extends Model<ControlModel> implements IControl {
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
    // define ENUM constraint at DB level
    type: DataType.ENUM("Waiting", "In progress", "Done"),
  })
  status?: "Waiting" | "In progress" | "Done";

  @Column({
    type: DataType.INTEGER,
  })
  approver?: number;

  @Column({
    type: DataType.ENUM("Acceptable risk", "Residual risk", "Unacceptable risk"),
  })
  risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk";

  @Column({
    type: DataType.INTEGER,
  })
  owner?: number;

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

  @ForeignKey(() => ControlCategoryModel)
  @Column({
    type: DataType.INTEGER,
  })
  control_category_id!: number;

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
   * Create a new control with comprehensive validation
   */
  static async createNewControl(
    title: string,
    description: string,
    control_category_id: number,
    order_no?: number,
    owner?: number,
    reviewer?: number,
    approver?: number,
    due_date?: Date,
    implementation_details?: string,
    is_demo: boolean = false,
  ): Promise<ControlModel> {
    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", title);
    }

    if (title.trim().length < 3) {
      throw new ValidationException("Title must be at least 3 characters long", "title", title);
    }

    if (!description || description.trim().length === 0) {
      throw new ValidationException("Description is required", "description", description);
    }

    if (description.trim().length < 10) {
      throw new ValidationException(
        "Description must be at least 10 characters long",
        "description",
        description,
      );
    }

    // Validate control_category_id
    if (!numberValidation(control_category_id, 1)) {
      throw new ValidationException(
        "Valid control_category_id is required (must be >= 1)",
        "control_category_id",
        control_category_id,
      );
    }

    // Validate order_no if provided
    if (order_no !== undefined && !numberValidation(order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        order_no,
      );
    }

    // Validate user IDs if provided
    if (owner !== undefined && !numberValidation(owner, 1)) {
      throw new ValidationException("Owner ID must be a positive integer", "owner", owner);
    }

    if (reviewer !== undefined && !numberValidation(reviewer, 1)) {
      throw new ValidationException("Reviewer ID must be a positive integer", "reviewer", reviewer);
    }

    if (approver !== undefined && !numberValidation(approver, 1)) {
      throw new ValidationException("Approver ID must be a positive integer", "approver", approver);
    }

    // Validate due_date if provided
    if (due_date !== undefined) {
      const dueDate = new Date(due_date);
      if (isNaN(dueDate.getTime())) {
        throw new ValidationException("Invalid due date format", "due_date", due_date);
      }

      // Ensure due date is not in the past
      const now = new Date();
      if (dueDate < now) {
        throw new ValidationException("Due date cannot be in the past", "due_date", due_date);
      }
    }

    // Create and return the control model instance
    const control = new ControlModel();
    control.title = title.trim();
    control.description = description.trim();
    control.control_category_id = control_category_id;
    control.order_no = order_no;
    control.owner = owner;
    control.reviewer = reviewer;
    control.approver = approver;
    control.due_date = due_date;
    control.implementation_details = implementation_details?.trim();
    control.status = "Waiting"; // Default status
    control.is_demo = is_demo;
    control.created_at = new Date();

    return control;
  }

  /**
   * Update control information with validation
   */
  async updateControl(updateData: {
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
  }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Title is required", "title", updateData.title);
      }
      if (updateData.title.trim().length < 3) {
        throw new ValidationException(
          "Title must be at least 3 characters long",
          "title",
          updateData.title,
        );
      }
      this.title = updateData.title.trim();
    }

    // Validate description if provided
    if (updateData.description !== undefined) {
      if (!updateData.description || updateData.description.trim().length === 0) {
        throw new ValidationException(
          "Description is required",
          "description",
          updateData.description,
        );
      }
      if (updateData.description.trim().length < 10) {
        throw new ValidationException(
          "Description must be at least 10 characters long",
          "description",
          updateData.description,
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
          updateData.order_no,
        );
      }
      this.order_no = updateData.order_no;
    }

    // Validate status if provided
    if (updateData.status !== undefined) {
      const validStatuses = ["Waiting", "In progress", "Done"];
      if (!validStatuses.includes(updateData.status)) {
        throw new ValidationException("Invalid status value", "status", updateData.status);
      }
      this.status = updateData.status;
    }

    // Validate user IDs if provided
    if (updateData.owner !== undefined) {
      if (!numberValidation(updateData.owner, 1)) {
        throw new ValidationException(
          "Owner ID must be a positive integer",
          "owner",
          updateData.owner,
        );
      }
      this.owner = updateData.owner;
    }

    if (updateData.reviewer !== undefined) {
      if (!numberValidation(updateData.reviewer, 1)) {
        throw new ValidationException(
          "Reviewer ID must be a positive integer",
          "reviewer",
          updateData.reviewer,
        );
      }
      this.reviewer = updateData.reviewer;
    }

    if (updateData.approver !== undefined) {
      if (!numberValidation(updateData.approver, 1)) {
        throw new ValidationException(
          "Approver ID must be a positive integer",
          "approver",
          updateData.approver,
        );
      }
      this.approver = updateData.approver;
    }

    // Validate risk_review if provided
    if (updateData.risk_review !== undefined) {
      const validRiskReviews = ["Acceptable risk", "Residual risk", "Unacceptable risk"];
      if (!validRiskReviews.includes(updateData.risk_review)) {
        throw new ValidationException(
          "Invalid risk review value",
          "risk_review",
          updateData.risk_review,
        );
      }
      this.risk_review = updateData.risk_review;
    }

    // Validate due_date if provided
    if (updateData.due_date !== undefined) {
      const dueDate = new Date(updateData.due_date);
      if (isNaN(dueDate.getTime())) {
        throw new ValidationException("Invalid due date format", "due_date", updateData.due_date);
      }
      this.due_date = dueDate;
    }

    // Validate implementation_details if provided
    if (updateData.implementation_details !== undefined) {
      this.implementation_details = updateData.implementation_details.trim();
    }
  }

  /**
   * Validate control data before saving
   */
  async validateControlData(): Promise<void> {
    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", this.title);
    }

    if (this.title.trim().length < 3) {
      throw new ValidationException(
        "Title must be at least 3 characters long",
        "title",
        this.title,
      );
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new ValidationException("Description is required", "description", this.description);
    }

    if (this.description.trim().length < 10) {
      throw new ValidationException(
        "Description must be at least 10 characters long",
        "description",
        this.description,
      );
    }

    if (!this.control_category_id || !numberValidation(this.control_category_id, 1)) {
      throw new ValidationException(
        "Valid control_category_id is required",
        "control_category_id",
        this.control_category_id,
      );
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        this.order_no,
      );
    }

    if (this.owner !== undefined && !numberValidation(this.owner, 1)) {
      throw new ValidationException("Owner ID must be a positive integer", "owner", this.owner);
    }

    if (this.reviewer !== undefined && !numberValidation(this.reviewer, 1)) {
      throw new ValidationException(
        "Reviewer ID must be a positive integer",
        "reviewer",
        this.reviewer,
      );
    }

    if (this.approver !== undefined && !numberValidation(this.approver, 1)) {
      throw new ValidationException(
        "Approver ID must be a positive integer",
        "approver",
        this.approver,
      );
    }
  }

  /**
   * Check if control is overdue
   */
  isOverdue(): boolean {
    if (!this.due_date) {
      return false;
    }
    return new Date() > this.due_date && this.status !== "Done";
  }

  /**
   * Check if control is completed
   */
  isCompleted(): boolean {
    return this.status === "Done";
  }

  /**
   * Check if control is in progress
   */
  isInProgress(): boolean {
    return this.status === "In progress";
  }

  /**
   * Check if control is waiting
   */
  isWaiting(): boolean {
    return this.status === "Waiting";
  }

  /**
   * Check if control has high risk
   */
  hasHighRisk(): boolean {
    return this.risk_review === "Unacceptable risk";
  }

  /**
   * Check if control has acceptable risk
   */
  hasAcceptableRisk(): boolean {
    return this.risk_review === "Acceptable risk";
  }

  /**
   * Check if control has residual risk
   */
  hasResidualRisk(): boolean {
    return this.risk_review === "Residual risk";
  }

  /**
   * Check if control is a demo control
   */
  isDemoControl(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if control can be modified by a user
   */
  canBeModifiedBy(userId: number, isAdmin: boolean = false): boolean {
    if (this.isDemoControl()) {
      throw new BusinessLogicException(
        "Demo controls cannot be modified",
        "DEMO_CONTROL_RESTRICTION",
        { controlId: this.id, userId },
      );
    }

    // Admin can modify any control
    if (isAdmin) {
      return true;
    }

    // Users can modify controls they own or are assigned to
    return this.owner === userId || this.reviewer === userId || this.approver === userId;
  }

  /**
   * Check if control can be deleted
   */
  canBeDeleted(): boolean {
    if (this.isDemoControl()) {
      return false;
    }

    // Cannot delete completed controls
    if (this.isCompleted()) {
      return false;
    }

    return true;
  }

  /**
   * Get control progress percentage
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
   * Get days until due date
   */
  getDaysUntilDue(): number | null {
    if (!this.due_date) {
      return null;
    }

    const now = new Date();
    const dueDate = new Date(this.due_date);
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Get control status with additional context
   */
  getStatusWithContext(): {
    status: string;
    isOverdue: boolean;
    daysUntilDue: number | null;
    progressPercentage: number;
  } {
    return {
      status: this.status || "Waiting",
      isOverdue: this.isOverdue(),
      daysUntilDue: this.getDaysUntilDue(),
      progressPercentage: this.getProgressPercentage(),
    };
  }

  /**
   * Convert control model to JSON representation
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
      control_category_id: this.control_category_id,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      isOverdue: this.isOverdue(),
      isCompleted: this.isCompleted(),
      progressPercentage: this.getProgressPercentage(),
      daysUntilDue: this.getDaysUntilDue(),
    };
  }

  /**
   * Create ControlModel instance from JSON data
   */
  static fromJSON(json: any): ControlModel {
    return new ControlModel(json);
  }

  /**
   * Get control summary for display
   */
  getSummary(): {
    id: number | undefined;
    title: string;
    status: string;
    riskLevel: string;
    progress: number;
  } {
    return {
      id: this.id,
      title: this.title,
      status: this.status || "Waiting",
      riskLevel: this.risk_review || "Not assessed",
      progress: this.getProgressPercentage(),
    };
  }

  /**
   * Check if control requires immediate attention
   */
  requiresImmediateAttention(): boolean {
    const daysUntilDue = this.getDaysUntilDue();
    return this.isOverdue() || (daysUntilDue !== null && daysUntilDue <= 3 && !this.isCompleted());
  }

  /**
   * Get control priority level
   */
  getPriorityLevel(): "High" | "Medium" | "Low" {
    if (this.requiresImmediateAttention()) {
      return "High";
    }
    if (this.hasHighRisk()) {
      return "High";
    }
    if (this.isInProgress()) {
      return "Medium";
    }
    return "Low";
  }
}
