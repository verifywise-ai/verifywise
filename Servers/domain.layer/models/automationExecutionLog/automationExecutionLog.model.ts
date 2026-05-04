import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { AutomationModel } from "../automation/automation.model";

export interface IActionExecutionResult {
  action_id?: number;
  action_type: string;
  status: "success" | "failure";
  result_data?: object;
  error_message?: string;
  executed_at?: Date;
}

export interface IAutomationExecutionLog {
  id?: number;
  automation_id: number;
  triggered_at?: Date;
  trigger_data?: object;
  action_results?: IActionExecutionResult[];
  status?: "success" | "partial_success" | "failure";
  error_message?: string;
  created_at?: Date;
}

@Table({
  tableName: "automation_execution_logs",
  timestamps: true,
  underscored: true,
})
export class AutomationExecutionLogModel
  extends Model<AutomationExecutionLogModel>
  implements IAutomationExecutionLog
{
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

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  triggered_at?: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  trigger_data?: object;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  action_results?: IActionExecutionResult[];

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    defaultValue: "success",
  })
  status?: "success" | "partial_success" | "failure";

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  error_message?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  execution_time_ms?: number;

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
   * Factory method to create a new execution log
   */
  static async createExecutionLog(
    automation_id: number,
    trigger_data: object = {},
    status: "success" | "partial_success" | "failure" = "success",
    error_message?: string,
  ): Promise<AutomationExecutionLogModel> {
    const log = new AutomationExecutionLogModel();
    log.automation_id = automation_id;
    log.trigger_data = trigger_data;
    log.status = status;
    log.error_message = error_message;
    log.triggered_at = new Date();

    return log;
  }

  /**
   * Find execution logs by automation ID
   */
  static async findByAutomationId(
    automation_id: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ logs: AutomationExecutionLogModel[]; total: number }> {
    const { rows, count } = await AutomationExecutionLogModel.findAndCountAll({
      where: { automation_id },
      order: [["triggered_at", "DESC"]],
      limit,
      offset,
    });

    return { logs: rows, total: count };
  }

  /**
   * Get execution statistics for an automation
   */
  static async getExecutionStats(automation_id: number): Promise<{
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    last_execution_at?: Date;
  }> {
    const stats = await AutomationExecutionLogModel.findAll({
      where: { automation_id },
      attributes: [
        [AutomationExecutionLogModel.sequelize!.fn("COUNT", "*"), "total_executions"],
        [
          AutomationExecutionLogModel.sequelize!.fn(
            "SUM",
            AutomationExecutionLogModel.sequelize!.literal(
              "CASE WHEN status = 'success' THEN 1 ELSE 0 END",
            ),
          ),
          "successful_executions",
        ],
        [
          AutomationExecutionLogModel.sequelize!.fn(
            "SUM",
            AutomationExecutionLogModel.sequelize!.literal(
              "CASE WHEN status = 'failure' THEN 1 ELSE 0 END",
            ),
          ),
          "failed_executions",
        ],
        [
          AutomationExecutionLogModel.sequelize!.fn(
            "MAX",
            AutomationExecutionLogModel.sequelize!.col("triggered_at"),
          ),
          "last_execution_at",
        ],
      ],
      raw: true,
    });

    const result = stats[0] as any;
    return {
      total_executions: parseInt(result.total_executions) || 0,
      successful_executions: parseInt(result.successful_executions) || 0,
      failed_executions: parseInt(result.failed_executions) || 0,
      last_execution_at: result.last_execution_at || undefined,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      id: this.id,
      automation_id: this.automation_id,
      triggered_at: this.triggered_at,
      trigger_data: this.trigger_data,
      action_results: this.action_results || [],
      status: this.status,
      error_message: this.error_message,
      execution_time_ms: this.execution_time_ms,
      created_at: this.createdAt ?? this.created_at,
      updated_at: this.updatedAt ?? this.updated_at,
    };
  }
}
