import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { TasksModel } from "../tasks/tasks.model";
import {
  ITaskAssignee,
  ITaskAssigneeSafeJSON,
  ITaskAssigneeJSON,
} from "../../interfaces/i.taskAssignee";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  NotFoundException,
  ConflictException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "task_assignees",
  timestamps: true,
  underscored: true,
})
export class TaskAssigneesModel extends Model<TaskAssigneesModel> implements ITaskAssignee {
  @ForeignKey(() => TasksModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  task_id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  user_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  assigned_at?: Date;

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
   * Create a new task assignee
   */
  static async createNewTaskAssignee(
    taskId: number,
    userId: number,
    assigned_at: Date = new Date(),
  ): Promise<TaskAssigneesModel> {
    // Validate task_id
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    // Validate user_id
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    // Check if the task-user combination already exists
    const existingAssignee = await TaskAssigneesModel.findOne({
      where: {
        task_id: taskId,
        user_id: userId,
      },
    });

    if (existingAssignee) {
      throw new ConflictException(
        "User is already assigned to this task",
        "TaskAssignee",
        "task_id,user_id",
      );
    }

    // Create and return the task assignee model instance
    return new TaskAssigneesModel({
      task_id: taskId,
      user_id: userId,
      assigned_at: assigned_at,
    });
  }

  /**
   * Update task assignee information with validation
   */
  async updateTaskAssignee(updateData: { assigned_at?: Date }): Promise<void> {
    // Update date field if provided
    if (updateData.assigned_at !== undefined) {
      this.assigned_at = updateData.assigned_at;
    }
  }

  /**
   * Validate task assignee data before saving
   */
  async validateTaskAssigneeData(): Promise<void> {
    if (!this.task_id || !numberValidation(this.task_id, 1)) {
      throw new ValidationException(
        "Valid task_id is required (must be >= 1)",
        "task_id",
        this.task_id,
      );
    }

    if (!this.user_id || !numberValidation(this.user_id, 1)) {
      throw new ValidationException(
        "Valid user_id is required (must be >= 1)",
        "user_id",
        this.user_id,
      );
    }
  }

  /**
   * Get task assignee summary
   */
  getSummary(): {
    taskId: number;
    userId: number;
    assignedAt: Date | undefined;
  } {
    return {
      taskId: this.task_id,
      userId: this.user_id,
      assignedAt: this.assigned_at,
    };
  }

  /**
   * Get task assignee data without sensitive information
   */
  toSafeJSON(): ITaskAssigneeSafeJSON {
    return {
      taskId: this.task_id,
      userId: this.user_id,
      assignedAt: this.assigned_at?.toISOString(),
    };
  }

  /**
   * Convert task assignee model to JSON representation
   */
  toJSON(): ITaskAssigneeJSON {
    return {
      task_id: this.task_id,
      user_id: this.user_id,
      assigned_at: this.assigned_at?.toISOString(),
    };
  }

  /**
   * Static method to find task assignee by task and user IDs with validation
   */
  static async findByTaskAndUser(
    taskId: number,
    userId: number,
  ): Promise<TaskAssigneesModel | null> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await TaskAssigneesModel.findOne({
      where: {
        task_id: taskId,
        user_id: userId,
      },
    });
  }

  /**
   * Static method to find task assignee by task and user IDs with validation
   */
  static async findByTaskAndUserWithValidation(
    taskId: number,
    userId: number,
  ): Promise<TaskAssigneesModel> {
    const taskAssignee = await TaskAssigneesModel.findByTaskAndUser(taskId, userId);

    if (!taskAssignee) {
      throw new NotFoundException("Task assignee not found", "TaskAssignee", {
        taskId,
        userId,
      });
    }

    return taskAssignee;
  }

  /**
   * Static method to find all task assignees by task ID
   */
  static async findByTaskId(taskId: number): Promise<TaskAssigneesModel[]> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    return await TaskAssigneesModel.findAll({
      where: { task_id: taskId },
    });
  }

  /**
   * Static method to find all assigned tasks by user ID
   */
  static async findByUserId(userId: number): Promise<TaskAssigneesModel[]> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await TaskAssigneesModel.findAll({
      where: { user_id: userId },
    });
  }

  /**
   * Static method to update task assignee by task and user IDs
   */
  static async updateTaskAssigneeByTaskAndUser(
    taskId: number,
    userId: number,
    updateData: Partial<ITaskAssignee>,
  ): Promise<[number, TaskAssigneesModel[]]> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await TaskAssigneesModel.update(updateData, {
      where: {
        task_id: taskId,
        user_id: userId,
      },
      returning: true,
    });
  }

  /**
   * Static method to delete task assignee by task and user IDs
   */
  static async deleteTaskAssigneeByTaskAndUser(taskId: number, userId: number): Promise<number> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await TaskAssigneesModel.destroy({
      where: {
        task_id: taskId,
        user_id: userId,
      },
    });
  }

  /**
   * Static method to check if user is assigned to a task
   */
  static async isUserAssignedToTask(taskId: number, userId: number): Promise<boolean> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    const assignee = await TaskAssigneesModel.findOne({
      where: {
        task_id: taskId,
        user_id: userId,
      },
    });

    return assignee !== null;
  }

  /**
   * Static method to get task assignee count by task ID
   */
  static async getTaskAssigneeCount(taskId: number): Promise<number> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    return await TaskAssigneesModel.count({
      where: { task_id: taskId },
    });
  }

  /**
   * Static method to get user assigned task count by user ID
   */
  static async getUserAssignedTaskCount(userId: number): Promise<number> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await TaskAssigneesModel.count({
      where: { user_id: userId },
    });
  }

  /**
   * Static method to assign multiple users to a task
   */
  static async assignUsersToTask(taskId: number, userIds: number[]): Promise<TaskAssigneesModel[]> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    const assignees: TaskAssigneesModel[] = [];

    for (const userId of userIds) {
      try {
        const assignee = await TaskAssigneesModel.createNewTaskAssignee(taskId, userId);
        await assignee.save();
        assignees.push(assignee);
      } catch (error) {
        if (error instanceof ConflictException) {
          // Skip if already assigned
          continue;
        }
        throw error;
      }
    }

    return assignees;
  }

  /**
   * Static method to remove users from task
   */
  static async removeUsersFromTask(taskId: number, userIds: number[]): Promise<number> {
    if (!numberValidation(taskId, 1)) {
      throw new ValidationException("Valid task_id is required (must be >= 1)", "task_id", taskId);
    }

    return await TaskAssigneesModel.destroy({
      where: {
        task_id: taskId,
        user_id: userIds,
      },
    });
  }

  /**
   * Static method to get task assignees (user IDs only)
   */
  static async getTaskAssignees(taskId: number): Promise<number[]> {
    const assignees = await TaskAssigneesModel.findByTaskId(taskId);
    return assignees.map((assignee) => assignee.user_id);
  }

  /**
   * Static method to get user assigned tasks (task IDs only)
   */
  static async getUserAssignedTasks(userId: number): Promise<number[]> {
    const assignments = await TaskAssigneesModel.findByUserId(userId);
    return assignments.map((assignment) => assignment.task_id);
  }

  constructor(init?: Partial<ITaskAssignee>) {
    super();
    if (init) {
      Object.assign(this, init);
    }
  }
}

export { ITaskAssignee };
