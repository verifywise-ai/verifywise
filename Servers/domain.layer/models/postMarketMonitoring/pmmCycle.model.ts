import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
  BelongsTo,
  HasMany,
  HasOne,
} from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IPMMCycle, CycleStatus } from "../../interfaces/i.postMarketMonitoring";
import { PMMConfigModel } from "./pmmConfig.model";
import { PMMResponseModel } from "./pmmResponse.model";
import { PMMReportModel } from "./pmmReport.model";

@Table({
  tableName: "post_market_monitoring_cycles",
  timestamps: false,
})
export class PMMCycleModel extends Model<PMMCycleModel> implements IPMMCycle {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => PMMConfigModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  config_id!: number;

  @BelongsTo(() => PMMConfigModel)
  config?: PMMConfigModel;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  cycle_number!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    defaultValue: "pending",
    validate: {
      isIn: [["pending", "in_progress", "completed", "escalated"]],
    },
  })
  status!: CycleStatus;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  started_at!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  due_at!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  reminder_sent_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  escalation_sent_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  completed_at?: Date;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  completed_by?: number;

  @BelongsTo(() => UserModel, "completed_by")
  completer?: UserModel;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  assigned_stakeholder_id?: number;

  @BelongsTo(() => UserModel, "assigned_stakeholder_id")
  stakeholder?: UserModel;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @HasMany(() => PMMResponseModel)
  responses?: PMMResponseModel[];

  @HasOne(() => PMMReportModel)
  report?: PMMReportModel;
}
