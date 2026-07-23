import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmMetric } from "../../interfaces/i.mrmMetric";

/**
 * An ingested metric point. Append-only / immutable — corrections are new points.
 * `timestamps: false` because this table has created_at + received_at but no
 * updated_at (points are never updated).
 */
@Table({
  tableName: "mrm_metrics",
  timestamps: false,
  underscored: true,
})
export class MrmMetricModel extends Model<MrmMetricModel> implements IMrmMetric {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  model_inventory_id!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  metric!: string;

  @Column({
    type: DataType.DOUBLE,
    allowNull: false,
  })
  value!: number;

  @Column({
    type: DataType.DATE, // when the metric pertains to
    allowNull: false,
  })
  at!: Date;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "",
  })
  window!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    defaultValue: "overall",
  })
  segment!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: {},
  })
  context?: Record<string, unknown>;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // which token wrote this point (audit); SET NULL on token delete
  })
  ingestion_token_id?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  received_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  constructor(init?: Partial<IMrmMetric>) {
    super();
    Object.assign(this, init);
  }
}
