import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RiskModel } from "../../models/risks/risk.model";
import { ControlEUModel } from "./controlEU.model";

export type ControlsEURisks = {
  control_id?: number;
  projects_risks_id?: number;
};

@Table({
  tableName: "controls_eu__risks",
})
export class ControlsEURisksModel extends Model<ControlsEURisks> {
  @ForeignKey(() => ControlEUModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  control_id?: number;

  @ForeignKey(() => RiskModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  projects_risks_id?: number;
}
