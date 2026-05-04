import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { ProjectModel } from "../project/project.model";
import { IPMMConfig, FrequencyUnit } from "../../interfaces/i.postMarketMonitoring";
import { PMMQuestionModel } from "./pmmQuestion.model";
import { PMMCycleModel } from "./pmmCycle.model";

@Table({
  tableName: "post_market_monitoring_configs",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class PMMConfigModel extends Model<PMMConfigModel> implements IPMMConfig {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: true,
  })
  project_id!: number;

  @BelongsTo(() => ProjectModel)
  project?: ProjectModel;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_active!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 30,
  })
  frequency_value!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    defaultValue: "days",
    validate: {
      isIn: [["days", "weeks", "months"]],
    },
  })
  frequency_unit!: FrequencyUnit;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  start_date?: Date | string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 3,
  })
  reminder_days!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 7,
  })
  escalation_days!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  escalation_contact_id?: number;

  @BelongsTo(() => UserModel, "escalation_contact_id")
  escalation_contact?: UserModel;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 9,
  })
  notification_hour!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  created_by?: number;

  @BelongsTo(() => UserModel, "created_by")
  creator?: UserModel;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  updated_at?: Date;

  @HasMany(() => PMMQuestionModel)
  questions?: PMMQuestionModel[];

  @HasMany(() => PMMCycleModel)
  cycles?: PMMCycleModel[];
}
