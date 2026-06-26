import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "regulation_tracked_countries", timestamps: false })
export class RegulationTrackedCountryModel extends Model<RegulationTrackedCountryModel> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  country_slug!: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  tracked_by?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  created_at?: Date;
}
