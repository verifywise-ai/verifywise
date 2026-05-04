import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RiskModel } from "../../models/risks/risk.model";
import { SubcontrolEUModel } from "./subControlEU.model";

export type SubcontrolEURisks = {
  subcontrol_id?: number;
  projects_risks_id?: number;
};

@Table({
  tableName: "subcontrols_eu__risks",
})
export class SubcontrolEURisksModel extends Model<SubcontrolEURisks> {
  @ForeignKey(() => SubcontrolEUModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  subcontrol_id?: number;

  @ForeignKey(() => RiskModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  projects_risks_id?: number;
}
