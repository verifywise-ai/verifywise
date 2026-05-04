import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RiskModel } from "../../models/risks/risk.model";
import { AnnexCategoryISOModel } from "./annexCategoryISO.model";

export type AnnexCategoryISORisks = {
  annexcategory_id?: number;
  projects_risks_id?: number;
};

@Table({
  tableName: "annexcategory_risks_iso",
})
export class AnnexCategoryISORisksModel extends Model<AnnexCategoryISORisks> {
  @ForeignKey(() => AnnexCategoryISOModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  annexcategory_id?: number;

  @ForeignKey(() => RiskModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  projects_risks_id?: number;
}
