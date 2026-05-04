import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { IPMMQuestion, QuestionType } from "../../interfaces/i.postMarketMonitoring";
import { PMMConfigModel } from "./pmmConfig.model";
import { PMMResponseModel } from "./pmmResponse.model";

@Table({
  tableName: "post_market_monitoring_questions",
  timestamps: false,
})
export class PMMQuestionModel extends Model<PMMQuestionModel> implements IPMMQuestion {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => PMMConfigModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  config_id?: number | null;

  @BelongsTo(() => PMMConfigModel)
  config?: PMMConfigModel;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  question_text!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    validate: {
      isIn: [["yes_no", "multi_select", "multi_line_text"]],
    },
  })
  question_type!: QuestionType;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  options?: string[];

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  suggestion_text?: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  is_required!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_system_default!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  allows_flag_for_concern!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  display_order!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  eu_ai_act_article?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @HasMany(() => PMMResponseModel)
  responses?: PMMResponseModel[];
}
