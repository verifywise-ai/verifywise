import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { ITenantAutomationAction } from "../../interfaces/i.tenantAutomationAction";
import { ValidationException } from "../../exceptions/custom.exception";
import { AutomationModel } from "../automation/automation.model";
import { AutomationActionModel } from "../automationAction/automationAction.model";

@Table({
  tableName: "automation_actions_data",
  timestamps: true,
  underscored: true,
})
export class TenantAutomationActionModel extends Model<TenantAutomationActionModel> implements ITenantAutomationAction {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => AutomationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  automation_id!: number;

  @BelongsTo(() => AutomationModel)
  automation?: AutomationModel;

  @ForeignKey(() => AutomationActionModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  action_type_id!: number;

  @BelongsTo(() => AutomationActionModel)
  action_type?: AutomationActionModel;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: {},
  })
  params?: Record<string, any>;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  order?: number;

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
   * Factory method to create a new tenant automation action
   */
  static async createNewTenantAutomationAction(
    automation_id: number,
    action_type_id: number,
    params?: Record<string, any>,
    order: number = 1
  ): Promise<TenantAutomationActionModel> {
    // Validate required fields
    if (!automation_id) {
      throw new ValidationException("Automation ID is required", "automation_id", automation_id);
    }

    if (!action_type_id) {
      throw new ValidationException("Action type ID is required", "action_type_id", action_type_id);
    }

    // Verify automation exists
    const automation = await AutomationModel.findByPk(automation_id);
    if (!automation) {
      throw new ValidationException("Automation not found", "automation_id", automation_id);
    }

    // Verify action type exists
    const actionType = await AutomationActionModel.findByPk(action_type_id);
    if (!actionType) {
      throw new ValidationException("Action type not found", "action_type_id", action_type_id);
    }

    // Validate order is positive
    if (order < 1) {
      throw new ValidationException("Order must be a positive integer", "order", order);
    }

    const tenantAction = new TenantAutomationActionModel();
    tenantAction.automation_id = automation_id;
    tenantAction.action_type_id = action_type_id;
    tenantAction.params = params || {};
    tenantAction.order = order;

    return tenantAction;
  }

  /**
   * Find all actions for an automation
   */
  static async findByAutomation(automation_id: number): Promise<TenantAutomationActionModel[]> {
    return await TenantAutomationActionModel.findAll({
      where: { automation_id },
      include: [
        { model: AutomationModel, as: "automation" },
        { model: AutomationActionModel, as: "action_type" },
      ],
      order: [["order", "ASC"]],
    });
  }

  /**
   * Find action by ID with relations
   */
  static async findActionById(id: number): Promise<TenantAutomationActionModel | null> {
    return await TenantAutomationActionModel.findByPk(id, {
      include: [
        { model: AutomationModel, as: "automation" },
        { model: AutomationActionModel, as: "action_type" },
      ],
    });
  }

  /**
   * Update tenant automation action
   */
  async updateAction(updateData: {
    action_type_id?: number;
    params?: Record<string, any>;
    order?: number;
  }): Promise<void> {
    if (updateData.action_type_id !== undefined) {
      const actionType = await AutomationActionModel.findByPk(updateData.action_type_id);
      if (!actionType) {
        throw new ValidationException("Action type not found", "action_type_id", updateData.action_type_id);
      }
      this.action_type_id = updateData.action_type_id;
    }

    if (updateData.params !== undefined) {
      this.params = updateData.params;
    }

    if (updateData.order !== undefined) {
      if (updateData.order < 1) {
        throw new ValidationException("Order must be a positive integer", "order", updateData.order);
      }
      this.order = updateData.order;
    }

    await this.save();
  }

  /**
   * Update action parameters
   */
  async updateParams(params: Record<string, any>): Promise<void> {
    this.params = { ...(this.params || {}), ...params };
    await this.save();
  }

  /**
   * Reorder action
   */
  async reorder(newOrder: number): Promise<void> {
    if (newOrder < 1) {
      throw new ValidationException("Order must be a positive integer", "order", newOrder);
    }
    this.order = newOrder;
    await this.save();
  }

  /**
   * Get merged parameters (default + custom)
   */
  getMergedParams(): Record<string, any> {
    if (!this.action_type) {
      return this.params || {};
    }
    return this.action_type.mergeWithDefaults(this.params || {});
  }

  /**
   * Get action summary
   */
  getSummary(): { id?: number; action_type?: string; order?: number } {
    return {
      id: this.id,
      action_type: this.action_type?.label,
      order: this.order,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      id: this.id,
      automation_id: this.automation_id,
      action_type_id: this.action_type_id,
      action_type: this.action_type?.toJSON(),
      params: this.params,
      order: this.order,
      created_at: (this.createdAt ?? this.created_at),
      updated_at: (this.updatedAt ?? this.updated_at),
    };
  }
}
