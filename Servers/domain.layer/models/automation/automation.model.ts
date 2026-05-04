import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { IAutomation } from "../../interfaces/i.automation";
import { ValidationException } from "../../exceptions/custom.exception";
import { AutomationTriggerModel } from "../automationTrigger/automationTrigger.model";
import { UserModel } from "../user/user.model";

@Table({
  tableName: "automations",
  timestamps: true,
  underscored: true,
})
export class AutomationModel extends Model<AutomationModel> implements IAutomation {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  name!: string;

  @ForeignKey(() => AutomationTriggerModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  trigger_id!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  params?: object;

  @BelongsTo(() => AutomationTriggerModel)
  trigger?: AutomationTriggerModel;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  is_active?: boolean;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  created_by?: number;

  @BelongsTo(() => UserModel)
  creator?: UserModel;

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
   * Factory method to create a new automation
   */
  static async createNewAutomation(
    name: string,
    trigger_id: number,
    created_by?: number,
    is_active: boolean = true,
  ): Promise<AutomationModel> {
    // Validate required fields
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Automation name is required", "name", name);
    }

    if (!trigger_id) {
      throw new ValidationException("Trigger ID is required", "trigger_id", trigger_id);
    }

    // Verify trigger exists
    const trigger = await AutomationTriggerModel.findByPk(trigger_id);
    if (!trigger) {
      throw new ValidationException("Trigger not found", "trigger_id", trigger_id);
    }

    // Verify user exists if provided
    if (created_by) {
      const user = await UserModel.findByPk(created_by);
      if (!user) {
        throw new ValidationException("User not found", "created_by", created_by);
      }
    }

    const automation = new AutomationModel();
    automation.name = name.trim();
    automation.trigger_id = trigger_id;
    automation.created_by = created_by;
    automation.is_active = is_active;

    return automation;
  }

  /**
   * Find automation by ID with relations
   */
  static async findAutomationById(id: number): Promise<AutomationModel | null> {
    return await AutomationModel.findByPk(id, {
      include: [
        { model: AutomationTriggerModel, as: "trigger" },
        { model: UserModel, as: "creator" },
      ],
    });
  }

  /**
   * Find all automations by trigger
   */
  static async findByTrigger(trigger_id: number): Promise<AutomationModel[]> {
    return await AutomationModel.findAll({
      where: { trigger_id },
      include: [
        { model: AutomationTriggerModel, as: "trigger" },
        { model: UserModel, as: "creator" },
      ],
    });
  }

  /**
   * Find all active automations
   */
  static async findActiveAutomations(): Promise<AutomationModel[]> {
    return await AutomationModel.findAll({
      where: { is_active: true },
      include: [
        { model: AutomationTriggerModel, as: "trigger" },
        { model: UserModel, as: "creator" },
      ],
    });
  }

  /**
   * Update automation
   */
  async updateAutomation(updateData: {
    name?: string;
    trigger_id?: number;
    is_active?: boolean;
  }): Promise<void> {
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new ValidationException("Name cannot be empty", "name", updateData.name);
      }
      this.name = updateData.name.trim();
    }

    if (updateData.trigger_id !== undefined) {
      const trigger = await AutomationTriggerModel.findByPk(updateData.trigger_id);
      if (!trigger) {
        throw new ValidationException("Trigger not found", "trigger_id", updateData.trigger_id);
      }
      this.trigger_id = updateData.trigger_id;
    }

    if (updateData.is_active !== undefined) {
      this.is_active = updateData.is_active;
    }

    await this.save();
  }

  /**
   * Activate automation
   */
  async activate(): Promise<void> {
    this.is_active = true;
    await this.save();
  }

  /**
   * Deactivate automation
   */
  async deactivate(): Promise<void> {
    this.is_active = false;
    await this.save();
  }

  /**
   * Check if automation is active
   */
  isActive(): boolean {
    return this.is_active === true;
  }

  /**
   * Get automation summary
   */
  getSummary(): { id?: number; name: string; trigger?: string; is_active?: boolean } {
    return {
      id: this.id,
      name: this.name,
      trigger: this.trigger?.label,
      is_active: this.is_active,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      trigger_id: this.trigger_id,
      trigger: this.trigger?.toJSON(),
      is_active: this.is_active,
      created_by: this.created_by,
      creator: this.creator?.toSafeJSON(),
      created_at: this.createdAt ?? this.created_at,
      updated_at: this.updatedAt ?? this.updated_at,
    };
  }
}
