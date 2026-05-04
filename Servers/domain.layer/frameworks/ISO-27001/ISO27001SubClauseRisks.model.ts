import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RiskModel } from "../../models/risks/risk.model";
import { ISO27001SubClauseModel } from "./ISO27001SubClause.model";
import { ISO27001SubClauseRisks } from "../../interfaces/i.ISO27001SubClauseRisks";

@Table({
  tableName: "subclauses_iso27001__risks",
})
export class ISO27001SubClauseRisksModel extends Model<ISO27001SubClauseRisks> {
  @ForeignKey(() => ISO27001SubClauseModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  subclause_id?: number;

  @ForeignKey(() => RiskModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  projects_risks_id?: number;
}
