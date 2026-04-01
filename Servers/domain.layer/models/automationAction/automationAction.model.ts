import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IAutomationAction } from "../../interfaces/i.automationAction";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "automation_actions",
  timestamps: true,
  underscored: true,
})
export class AutomationActionModel extends Model<AutomationActionModel> implements IAutomationAction {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    unique: true,
  })
  key!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  label!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: {},
  })
  default_params?: Record<string, any>;

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
   * Factory method to create a new automation action
   */
  static async createNewAutomationAction(
    key: string,
    label: string,
    description?: string,
    default_params?: Record<string, any>
  ): Promise<AutomationActionModel> {
    // Validate required fields
    if (!key || key.trim().length === 0) {
      throw new ValidationException("Action key is required", "key", key);
    }

    if (!label || label.trim().length === 0) {
      throw new ValidationException("Action label is required", "label", label);
    }

    // Check if key already exists
    const existingAction = await AutomationActionModel.findOne({ where: { key } });
    if (existingAction) {
      throw new ValidationException("Action with this key already exists", "key", key);
    }

    const action = new AutomationActionModel();
    action.key = key.trim();
    action.label = label.trim();
    action.description = description?.trim();
    action.default_params = default_params || {};

    return action;
  }

  /**
   * Find automation action by key
   */
  static async findByKey(key: string): Promise<AutomationActionModel | null> {
    return await AutomationActionModel.findOne({ where: { key } });
  }

  /**
   * Get all automation actions
   */
  static async getAllActions(): Promise<AutomationActionModel[]> {
    return await AutomationActionModel.findAll();
  }

  /**
   * Update automation action
   */
  async updateAction(updateData: {
    label?: string;
    description?: string;
    default_params?: Record<string, any>;
  }): Promise<void> {
    if (updateData.label !== undefined) {
      if (!updateData.label || updateData.label.trim().length === 0) {
        throw new ValidationException("Label cannot be empty", "label", updateData.label);
      }
      this.label = updateData.label.trim();
    }

    if (updateData.description !== undefined) {
      this.description = updateData.description?.trim();
    }

    if (updateData.default_params !== undefined) {
      this.default_params = updateData.default_params;
    }

    await this.save();
  }

  /**
   * Get action summary
   */
  getSummary(): { key: string; label: string; description?: string } {
    return {
      key: this.key,
      label: this.label,
      description: this.description,
    };
  }

  /**
   * Merge params with default params
   */
  mergeWithDefaults(customParams: Record<string, any>): Record<string, any> {
    return {
      ...(this.default_params || {}),
      ...customParams,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      id: this.id,
      key: this.key,
      label: this.label,
      description: this.description,
      default_params: this.default_params,
      created_at: (this.createdAt ?? this.created_at),
      updated_at: (this.updatedAt ?? this.updated_at),
    };
  }
}
