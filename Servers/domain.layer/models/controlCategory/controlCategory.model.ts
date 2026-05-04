import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProjectModel } from "../project/project.model";
import { IControlCategory } from "../../interfaces/i.controlCategory";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "control_categories",
  timestamps: true,
  underscored: true,
})
export class ControlCategoryModel extends Model<ControlCategoryModel> implements IControlCategory {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
  })
  project_id!: number;

  @Column({
    type: DataType.STRING,
  })
  title!: string;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

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
   * Create a new control category with validation
   */
  static async createNewControlCategory(
    projectId: number,
    title: string,
    orderNo?: number,
  ): Promise<ControlCategoryModel> {
    // Validate project_id
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    // Validate title
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", title);
    }

    if (title.trim().length < 2) {
      throw new ValidationException("Title must be at least 2 characters long", "title", title);
    }

    if (title.trim().length > 255) {
      throw new ValidationException("Title must not exceed 255 characters", "title", title);
    }

    // Validate order_no if provided
    if (orderNo !== undefined) {
      if (!numberValidation(orderNo, 0)) {
        throw new ValidationException(
          "Order number must be a non-negative integer",
          "order_no",
          orderNo,
        );
      }
    }

    // Create and return the control category model instance
    const controlCategory = new ControlCategoryModel();
    controlCategory.project_id = projectId;
    controlCategory.title = title.trim();
    controlCategory.order_no = orderNo || 0;
    controlCategory.created_at = new Date();
    controlCategory.is_demo = false;

    return controlCategory;
  }

  /**
   * Update control category with validation
   */
  async updateControlCategory(updateData: { title?: string; order_no?: number }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Title is required", "title", updateData.title);
      }

      if (updateData.title.trim().length < 2) {
        throw new ValidationException(
          "Title must be at least 2 characters long",
          "title",
          updateData.title,
        );
      }

      if (updateData.title.trim().length > 255) {
        throw new ValidationException(
          "Title must not exceed 255 characters",
          "title",
          updateData.title,
        );
      }

      this.title = updateData.title.trim();
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (!numberValidation(updateData.order_no, 0)) {
        throw new ValidationException(
          "Order number must be a non-negative integer",
          "order_no",
          updateData.order_no,
        );
      }
      this.order_no = updateData.order_no;
    }
  }

  /**
   * Validate control category data before saving
   */
  async validateControlCategoryData(): Promise<void> {
    if (!this.project_id || !numberValidation(this.project_id, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }

    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", this.title);
    }

    if (this.title.trim().length < 2) {
      throw new ValidationException(
        "Title must be at least 2 characters long",
        "title",
        this.title,
      );
    }

    if (this.title.trim().length > 255) {
      throw new ValidationException("Title must not exceed 255 characters", "title", this.title);
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 0)) {
      throw new ValidationException(
        "Order number must be a non-negative integer",
        "order_no",
        this.order_no,
      );
    }
  }

  /**
   * Check if control category is a demo category
   */
  isDemoCategory(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Prevent demo categories from being modified
   */
  canBeModified(): boolean {
    if (this.isDemoCategory()) {
      throw new BusinessLogicException(
        "Demo control categories cannot be modified",
        "DEMO_CATEGORY_RESTRICTION",
        { categoryId: this.id, categoryTitle: this.title },
      );
    }
    return true;
  }

  /**
   * Get control category data without sensitive information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      title: this.title,
      order_no: this.order_no,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      is_demo: this.is_demo,
    };
  }

  /**
   * Get display title (with order number if available)
   */
  getDisplayTitle(): string {
    if (this.order_no !== undefined && this.order_no > 0) {
      return `${this.order_no}. ${this.title}`;
    }
    return this.title;
  }

  /**
   * Check if control category is active (not demo)
   */
  isActive(): boolean {
    return !this.isDemoCategory();
  }

  /**
   * Static method to create control category from JSON data
   */
  static fromJSON(json: any): ControlCategoryModel {
    return new ControlCategoryModel(json);
  }

  /**
   * Convert control category model to JSON representation
   */
  toJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      project_id: this.project_id,
      title: this.title,
      order_no: this.order_no,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      is_demo: this.is_demo,
      // Include dynamically added properties from queries
      controls: dataValues?.controls,
    };
  }

  /**
   * Static method to find control category by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<ControlCategoryModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const controlCategory = await ControlCategoryModel.findByPk(id);
    if (!controlCategory) {
      throw new NotFoundException("Control category not found", "ControlCategory", id);
    }

    return controlCategory;
  }

  /**
   * Static method to find control categories by project ID
   */
  static async findByProjectId(projectId: number): Promise<ControlCategoryModel[]> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await ControlCategoryModel.findAll({
      where: { project_id: projectId },
      order: [
        ["order_no", "ASC"],
        ["created_at", "ASC"],
      ],
    });
  }

  /**
   * Static method to update control category
   */
  static async updateControlCategoryById(
    id: number,
    updateData: Partial<IControlCategory>,
  ): Promise<[number, ControlCategoryModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await ControlCategoryModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete control category
   */
  static async deleteControlCategoryById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await ControlCategoryModel.destroy({
      where: { id },
    });
  }

  constructor(init?: Partial<IControlCategory>) {
    super();
    Object.assign(this, init);
  }
}
