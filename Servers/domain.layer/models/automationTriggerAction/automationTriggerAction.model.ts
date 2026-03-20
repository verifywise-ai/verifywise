import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { IAutomationTriggerAction } from "../../interfaces/i.automationTriggerAction";
import { ValidationException } from "../../exceptions/custom.exception";
import { AutomationTriggerModel } from "../automationTrigger/automationTrigger.model";
import { AutomationActionModel } from "../automationAction/automationAction.model";

@Table({
  tableName: "automation_triggers_actions",
  timestamps: true,
  underscored: true,
})
export class AutomationTriggerActionModel extends Model<AutomationTriggerActionModel> implements IAutomationTriggerAction {
  @ForeignKey(() => AutomationTriggerModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  trigger_id!: number;

  @BelongsTo(() => AutomationTriggerModel)
  trigger?: AutomationTriggerModel;

  @ForeignKey(() => AutomationActionModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  action_id!: number;

  @BelongsTo(() => AutomationActionModel)
  action?: AutomationActionModel;

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
   * Factory method to create a new trigger-action association
   */
  static async createNewTriggerAction(
    trigger_id: number,
    action_id: number
  ): Promise<AutomationTriggerActionModel> {
    // Validate required fields
    if (!trigger_id) {
      throw new ValidationException("Trigger ID is required", "trigger_id", trigger_id);
    }

    if (!action_id) {
      throw new ValidationException("Action ID is required", "action_id", action_id);
    }

    // Verify trigger exists
    const trigger = await AutomationTriggerModel.findByPk(trigger_id);
    if (!trigger) {
      throw new ValidationException("Trigger not found", "trigger_id", trigger_id);
    }

    // Verify action exists
    const action = await AutomationActionModel.findByPk(action_id);
    if (!action) {
      throw new ValidationException("Action not found", "action_id", action_id);
    }

    // Check if association already exists
    const existingAssociation = await AutomationTriggerActionModel.findOne({
      where: { trigger_id, action_id },
    });
    if (existingAssociation) {
      throw new ValidationException(
        "This trigger-action association already exists",
        "trigger_action",
        { trigger_id, action_id }
      );
    }

    const triggerAction = new AutomationTriggerActionModel();
    triggerAction.trigger_id = trigger_id;
    triggerAction.action_id = action_id;

    return triggerAction;
  }

  /**
   * Find all actions for a trigger
   */
  static async findActionsByTrigger(trigger_id: number): Promise<AutomationTriggerActionModel[]> {
    return await AutomationTriggerActionModel.findAll({
      where: { trigger_id },
      include: [
        { model: AutomationTriggerModel, as: "trigger" },
        { model: AutomationActionModel, as: "action" },
      ],
    });
  }

  /**
   * Find all triggers for an action
   */
  static async findTriggersByAction(action_id: number): Promise<AutomationTriggerActionModel[]> {
    return await AutomationTriggerActionModel.findAll({
      where: { action_id },
      include: [
        { model: AutomationTriggerModel, as: "trigger" },
        { model: AutomationActionModel, as: "action" },
      ],
    });
  }

  /**
   * Check if a trigger-action association exists
   */
  static async associationExists(trigger_id: number, action_id: number): Promise<boolean> {
    const association = await AutomationTriggerActionModel.findOne({
      where: { trigger_id, action_id },
    });
    return association !== null;
  }

  /**
   * Delete a trigger-action association
   */
  static async deleteAssociation(trigger_id: number, action_id: number): Promise<boolean> {
    const result = await AutomationTriggerActionModel.destroy({
      where: { trigger_id, action_id },
    });
    return result > 0;
  }

  /**
   * Get all available actions for a trigger
   */
  static async getAvailableActionsForTrigger(trigger_id: number): Promise<AutomationActionModel[]> {
    // Get all actions associated with this trigger
    const associations = await AutomationTriggerActionModel.findActionsByTrigger(trigger_id);
    const actionIds = associations.map((assoc) => assoc.action_id);

    // Return the action models
    return await AutomationActionModel.findAll({
      where: { id: actionIds },
    });
  }

  /**
   * Bulk create trigger-action associations
   */
  static async bulkCreateAssociations(
    trigger_id: number,
    action_ids: number[]
  ): Promise<AutomationTriggerActionModel[]> {
    // Verify trigger exists
    const trigger = await AutomationTriggerModel.findByPk(trigger_id);
    if (!trigger) {
      throw new ValidationException("Trigger not found", "trigger_id", trigger_id);
    }

    const associations: AutomationTriggerActionModel[] = [];

    for (const action_id of action_ids) {
      // Verify action exists
      const action = await AutomationActionModel.findByPk(action_id);
      if (!action) {
        throw new ValidationException(`Action with ID ${action_id} not found`, "action_id", action_id);
      }

      // Check if association already exists
      const exists = await AutomationTriggerActionModel.associationExists(trigger_id, action_id);
      if (!exists) {
        const association = new AutomationTriggerActionModel();
        association.trigger_id = trigger_id;
        association.action_id = action_id;
        associations.push(association);
      }
    }

    return associations;
  }

  /**
   * Get association summary
   */
  getSummary(): { trigger?: string; action?: string } {
    return {
      trigger: this.trigger?.label,
      action: this.action?.label,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      trigger_id: this.trigger_id,
      action_id: this.action_id,
      trigger: this.trigger?.toJSON(),
      action: this.action?.toJSON(),
      created_at: (this.createdAt ?? this.created_at),
      updated_at: (this.updatedAt ?? this.updated_at),
    };
  }
}
