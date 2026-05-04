import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { TaskPriority } from "../../enums/task-priority.enum";
import { TaskStatus } from "../../enums/task-status.enum";
import { ITask, ITaskSafeJSON } from "../../interfaces/i.task";
import { stringValidation, enumValidation } from "../../validations/string.valid";
import { numberValidation } from "../../validations/number.valid";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "tasks",
  timestamps: true,
  underscored: true, // This makes Sequelize use snake_case for timestamp fields
})
export class TasksModel extends Model<TasksModel> implements ITask {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: "Title cannot be empty",
      },
      len: {
        args: [1, 255],
        msg: "Title must be between 1 and 255 characters",
      },
    },
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  creator_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  organization_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  due_date?: Date;

  @Column({
    type: DataType.ENUM(...Object.values(TaskPriority)),
    allowNull: false,
    defaultValue: TaskPriority.MEDIUM,
    validate: {
      isIn: {
        args: [Object.values(TaskPriority)],
        msg: "Priority must be Low, Medium, or High",
      },
    },
  })
  priority!: TaskPriority;

  @Column({
    type: DataType.ENUM(...Object.values(TaskStatus)),
    allowNull: false,
    defaultValue: TaskStatus.OPEN,
    validate: {
      isIn: {
        args: [Object.values(TaskStatus)],
        msg: "Status must be Open, In Progress, Completed, Overdue, or Deleted",
      },
    },
  })
  status!: TaskStatus;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: [],
  })
  categories?: string[];

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

  static async createNewTask(task: ITask): Promise<TasksModel> {
    const taskModel = new TasksModel(task);
    await taskModel.validateTaskData();
    return taskModel;
  }

  async updateTask(updateData: {
    title?: string;
    description?: string;
    due_date?: Date;
    priority?: TaskPriority;
    status?: TaskStatus;
    categories?: string[];
    is_deleted?: boolean;
  }): Promise<void> {
    if (updateData.title !== undefined) {
      this.title = updateData.title;
    }
    if (updateData.description !== undefined) {
      this.description = updateData.description;
    }
    if (updateData.due_date !== undefined) {
      this.due_date = updateData.due_date;
    }
    if (updateData.priority !== undefined) {
      this.priority = updateData.priority;
    }
    if (updateData.status !== undefined) {
      this.status = updateData.status;
    }
    if (updateData.categories !== undefined) {
      this.categories = updateData.categories;
    }

    // Validate updated data before persisting
    await this.validateTaskData();

    // Persist changes to database
    await this.save();
  }

  /**
   * Validate task data with comprehensive checks
   */
  async validateTaskData(): Promise<void> {
    // Validate title
    if (!stringValidation(this.title, 1, 255)) {
      throw new ValidationException(
        "Title must be between 1 and 255 characters",
        "title",
        this.title,
      );
    }

    // Validate description length (optional field)
    if (this.description !== undefined && this.description !== null) {
      if (!stringValidation(this.description, 0, 5000, true)) {
        throw new ValidationException(
          "Description cannot exceed 5000 characters",
          "description",
          this.description,
        );
      }
    }

    // Validate creator_id
    if (!numberValidation(this.creator_id, 1)) {
      throw new ValidationException(
        "Valid creator_id is required (must be >= 1)",
        "creator_id",
        this.creator_id,
      );
    }

    // Validate organization_id (optional field)
    if (this.organization_id !== undefined && this.organization_id !== null) {
      if (!numberValidation(this.organization_id, 1)) {
        throw new ValidationException(
          "Valid organization_id is required (must be >= 1)",
          "organization_id",
          this.organization_id,
        );
      }
    }

    // Validate priority
    if (!enumValidation(this.priority, Object.values(TaskPriority))) {
      throw new ValidationException("Invalid priority value", "priority", this.priority);
    }

    // Validate status
    if (!enumValidation(this.status, Object.values(TaskStatus))) {
      throw new ValidationException("Invalid status value", "status", this.status);
    }

    // Validate due_date (must be in the future for new tasks)
    if (this.due_date && this.due_date <= new Date() && this.status === TaskStatus.OPEN) {
      throw new ValidationException(
        "Due date must be in the future for new tasks",
        "due_date",
        this.due_date,
      );
    }

    // Validate categories array
    if (this.categories) {
      if (!Array.isArray(this.categories)) {
        throw new ValidationException("Categories must be an array", "categories", this.categories);
      }

      for (const category of this.categories) {
        if (!stringValidation(category, 1, 50)) {
          throw new ValidationException(
            "Each category must be between 1 and 50 characters",
            "categories",
            category,
          );
        }
      }

      if (this.categories.length > 10) {
        throw new ValidationException(
          "Maximum 10 categories allowed",
          "categories",
          this.categories,
        );
      }
    }
  }

  /**
   * Check if the task is overdue
   */
  isOverdue(): boolean {
    if (
      !this.due_date ||
      this.status === TaskStatus.COMPLETED ||
      this.status === TaskStatus.DELETED
    )
      return false;
    return new Date() > this.due_date;
  }

  /**
   * Get task data
   */
  toSafeJSON(): ITaskSafeJSON {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      creator_id: this.creator_id,
      organization_id: this.organization_id!,
      due_date: this.due_date?.toISOString(),
      priority: this.priority,
      status: this.status,
      categories: this.categories,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Convert task model to JSON representation
   */
  toJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      creator_id: this.creator_id,
      organization_id: this.organization_id!,
      due_date: this.due_date?.toISOString(),
      priority: this.priority,
      status: this.status,
      categories: this.categories,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
      isOverdue: this.isOverdue(),
      // Include dynamically added properties from queries
      assignees: dataValues?.assignees,
      creator_name: dataValues?.creator_name,
      assignee_names: dataValues?.assignee_names,
    };
  }

  constructor(init?: Partial<ITask>) {
    super();
    if (init) {
      Object.assign(this, init);
    }
  }
}
