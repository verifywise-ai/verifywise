// Servers/domain.layer/models/aiTrustIndex/aiTrustIndexApp.model.ts
import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ITrustIndexApp, ITrustIndexAppData } from "../../interfaces/i.aiTrustIndex";

@Table({ tableName: "ai_trust_index_apps", timestamps: false })
export class AiTrustIndexAppModel extends Model<AiTrustIndexAppModel> implements ITrustIndexApp {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  slug!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  vendor?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  category?: string;

  @Column({ type: DataType.STRING(2), allowNull: true })
  letter_grade?: string;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  score_out_of_100?: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  data!: ITrustIndexAppData;

  @Column({ type: DataType.CHAR(64), allowNull: false })
  material_hash!: string;

  @Column({ type: DataType.CHAR(64), allowNull: false })
  full_hash!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active!: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  removed_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  last_changed_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  last_fetched_at?: Date | null;
}
