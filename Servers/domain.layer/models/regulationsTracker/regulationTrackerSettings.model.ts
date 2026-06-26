import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "regulation_tracker_settings", timestamps: false })
export class RegulationTrackerSettingsModel extends Model<RegulationTrackerSettingsModel> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  organization_id!: number;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  recipient_user_ids!: number[];

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  recipient_emails!: string[];

  @Column({ type: DataType.INTEGER, allowNull: true })
  updated_by?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  updated_at?: Date;
}
