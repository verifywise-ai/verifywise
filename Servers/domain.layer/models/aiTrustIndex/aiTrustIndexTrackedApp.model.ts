// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexTrackedApp.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "ai_trust_index_tracked_apps", timestamps: false })
export class AiTrustIndexTrackedAppModel extends Model<AiTrustIndexTrackedAppModel> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  app_slug!: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  tracked_by?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  created_at?: Date;
}
