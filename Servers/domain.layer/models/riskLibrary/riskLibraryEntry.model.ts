import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IRiskLibraryEntry, RiskLibrarySource } from "../../interfaces/i.riskLibrary";

@Table({
  tableName: "risk_library_entries",
})
export class RiskLibraryEntryModel
  extends Model<RiskLibraryEntryModel>
  implements IRiskLibraryEntry
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  source!: RiskLibrarySource;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  source_id!: string | null;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  summary!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description!: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  risk_type!: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  risk_source!: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  domain!: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  subdomain!: string | null;

  @Column({ type: DataType.STRING(20), allowNull: true })
  eu_ai_act_tier!: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  risk_category!: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  severity!: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  likelihood!: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  marginal_risk_description!: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  industry!: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  use_case!: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  ai_lifecycle_phase!: string | null;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true })
  applicable_model_types!: string[] | null;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true })
  tags!: string[] | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  is_active!: boolean;

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  created_at!: Date;

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  updated_at!: Date;
}
