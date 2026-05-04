import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RiskModel } from "../../models/risks/risk.model";
import { ISO27001AnnexControlModel } from "./ISO27001AnnexControl.model";
import { ISO27001SubClauseRisks } from "../../interfaces/i.ISO27001SubClauseRisks";

@Table({
  tableName: "annexcontrols_iso27001__risks",
})
export class ISO27001AnnexControlRisksModel extends Model<ISO27001SubClauseRisks> {
  @ForeignKey(() => ISO27001AnnexControlModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  annexcontrol_id?: number;

  @ForeignKey(() => RiskModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  projects_risks_id?: number;
}
