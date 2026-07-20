// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexMeta.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({ tableName: "ai_trust_index_meta", timestamps: false })
export class AiTrustIndexMetaModel extends Model<AiTrustIndexMetaModel> {
  @Column({ type: DataType.SMALLINT, primaryKey: true })
  id!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  seeded_at?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  last_good_count?: number | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  last_run_week?: string | null;
}
