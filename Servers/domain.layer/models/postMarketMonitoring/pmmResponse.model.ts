import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { IPMMResponse } from "../../interfaces/i.postMarketMonitoring";
import { PMMCycleModel } from "./pmmCycle.model";
import { PMMQuestionModel } from "./pmmQuestion.model";

@Table({
  tableName: "post_market_monitoring_responses",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  indexes: [
    {
      unique: true,
      fields: ["cycle_id", "question_id"],
    },
  ],
})
export class PMMResponseModel extends Model<PMMResponseModel> implements IPMMResponse {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => PMMCycleModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  cycle_id!: number;

  @BelongsTo(() => PMMCycleModel)
  cycle?: PMMCycleModel;

  @ForeignKey(() => PMMQuestionModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  question_id!: number;

  @BelongsTo(() => PMMQuestionModel)
  question?: PMMQuestionModel;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  response_value: any;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_flagged!: boolean;

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
}
