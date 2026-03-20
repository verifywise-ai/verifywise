import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IAutomationTrigger } from "../../interfaces/i.automationTrigger";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "automation_triggers",
  timestamps: true,
  underscored: true,
})
export class AutomationTriggerModel extends Model<AutomationTriggerModel> implements IAutomationTrigger {
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
    allowNull: false,
  })
  event_name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

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
   * Factory method to create a new automation trigger
   */
  static async createNewAutomationTrigger(
    key: string,
    label: string,
    event_name: string,
    description?: string
  ): Promise<AutomationTriggerModel> {
    // Validate required fields
    if (!key || key.trim().length === 0) {
      throw new ValidationException("Trigger key is required", "key", key);
    }

    if (!label || label.trim().length === 0) {
      throw new ValidationException("Trigger label is required", "label", label);
    }

    if (!event_name || event_name.trim().length === 0) {
      throw new ValidationException("Event name is required", "event_name", event_name);
    }

    // Check if key already exists
    const existingTrigger = await AutomationTriggerModel.findOne({ where: { key } });
    if (existingTrigger) {
      throw new ValidationException("Trigger with this key already exists", "key", key);
    }

    const trigger = new AutomationTriggerModel();
    trigger.key = key.trim();
    trigger.label = label.trim();
    trigger.event_name = event_name.trim();
    trigger.description = description?.trim();

    return trigger;
  }

  /**
   * Find automation trigger by key
   */
  static async findByKey(key: string): Promise<AutomationTriggerModel | null> {
    return await AutomationTriggerModel.findOne({ where: { key } });
  }

  /**
   * Find automation trigger by event name
   */
  static async findByEventName(event_name: string): Promise<AutomationTriggerModel[]> {
    return await AutomationTriggerModel.findAll({ where: { event_name } });
  }

  /**
   * Update automation trigger
   */
  async updateTrigger(updateData: {
    label?: string;
    event_name?: string;
    description?: string;
  }): Promise<void> {
    if (updateData.label !== undefined) {
      if (!updateData.label || updateData.label.trim().length === 0) {
        throw new ValidationException("Label cannot be empty", "label", updateData.label);
      }
      this.label = updateData.label.trim();
    }

    if (updateData.event_name !== undefined) {
      if (!updateData.event_name || updateData.event_name.trim().length === 0) {
        throw new ValidationException("Event name cannot be empty", "event_name", updateData.event_name);
      }
      this.event_name = updateData.event_name.trim();
    }

    if (updateData.description !== undefined) {
      this.description = updateData.description?.trim();
    }

    await this.save();
  }

  /**
   * Get trigger summary
   */
  getSummary(): { key: string; label: string; event_name: string } {
    return {
      key: this.key,
      label: this.label,
      event_name: this.event_name,
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
      event_name: this.event_name,
      description: this.description,
      created_at: (this.createdAt ?? this.created_at),
      updated_at: (this.updatedAt ?? this.updated_at),
    };
  }
}
