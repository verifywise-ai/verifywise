import {
  Column,
  DataType,
  Model,
  Table,
} from "sequelize-typescript";
import { FriaLikelihood, FriaSeverity } from "../../enums/fria-status.enum";
import { IFriaRiskItem } from "../../interfaces/i.fria";

@Table({
  tableName: "fria_risk_items",
  timestamps: true,
  underscored: true,
})
export class FriaRiskItemModel
  extends Model<FriaRiskItemModel>
  implements IFriaRiskItem
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  fria_id!: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  risk_description!: string;

  @Column({ type: DataType.STRING(10), allowNull: true })
  likelihood?: FriaLikelihood;

  @Column({ type: DataType.STRING(10), allowNull: true })
  severity?: FriaSeverity;

  @Column({ type: DataType.TEXT, allowNull: true })
  existing_controls?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  further_action?: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  linked_project_risk_id?: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  sort_order!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  created_at?: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  updated_at?: Date;

  toSafeJSON(): IFriaRiskItem {
    return {
      id: this.id,
      organization_id: this.organization_id,
      fria_id: this.fria_id,
      risk_description: this.risk_description,
      likelihood: this.likelihood,
      severity: this.severity,
      existing_controls: this.existing_controls,
      further_action: this.further_action,
      linked_project_risk_id: this.linked_project_risk_id,
      sort_order: this.sort_order,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
