import {
  Column,
  DataType,
  Model,
  Table,
} from "sequelize-typescript";
import { IFriaRight } from "../../interfaces/i.fria";

@Table({
  tableName: "fria_rights",
  timestamps: false,
  underscored: true,
})
export class FriaRightModel
  extends Model<FriaRightModel>
  implements IFriaRight
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

  @Column({ type: DataType.STRING(50), allowNull: false })
  right_key!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  right_title!: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  charter_ref!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  flagged!: boolean;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  severity!: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  confidence!: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  impact_pathway?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  mitigation?: string;

  toSafeJSON(): IFriaRight {
    return {
      id: this.id,
      organization_id: this.organization_id,
      fria_id: this.fria_id,
      right_key: this.right_key,
      right_title: this.right_title,
      charter_ref: this.charter_ref,
      flagged: this.flagged,
      severity: this.severity,
      confidence: this.confidence,
      impact_pathway: this.impact_pathway,
      mitigation: this.mitigation,
    };
  }
}
