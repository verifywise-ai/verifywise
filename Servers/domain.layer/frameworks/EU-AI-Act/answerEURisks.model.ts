import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RiskModel } from "../../models/risks/risk.model";
import { AnswerEUModel } from "./answerEU.model";

export type AnswerEURisks = {
  answer_id?: number;
  projects_risks_id?: number;
};

@Table({
  tableName: "answers_eu__risks",
})
export class AnswerEURisksModel extends Model<AnswerEURisks> {
  @ForeignKey(() => AnswerEUModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  answer_id?: number;

  @ForeignKey(() => RiskModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  projects_risks_id?: number;
}
