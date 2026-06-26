import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "regulation_tracker_meta", timestamps: false })
export class RegulationTrackerMetaModel extends Model<RegulationTrackerMetaModel> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  id!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  seeded_at?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  last_good_count?: number | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  last_run_week?: string | null;
}
