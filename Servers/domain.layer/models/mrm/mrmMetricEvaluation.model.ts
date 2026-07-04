import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmMetricEvaluation, MrmThresholdSnapshot } from "../../interfaces/i.mrmMetricEvaluation";
import { MrmEvalStatus } from "../../enums/mrmMonitoring.enum";

/**
 * An immutable evaluation of an ingested point against a threshold.
 * `timestamps: false` — the only timestamp is evaluated_at (append-only).
 */
@Table({
  tableName: "mrm_metric_evaluations",
  timestamps: false,
  underscored: true,
})
export class MrmMetricEvaluationModel
  extends Model<MrmMetricEvaluationModel>
  implements IMrmMetricEvaluation
{
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
  metric_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // null = no_threshold, or threshold later deleted (snapshot preserves it)
  })
  threshold_id?: number;

  @Column({
    type: DataType.ENUM(...Object.values(MrmEvalStatus)),
    allowNull: false,
  })
  status!: MrmEvalStatus;

  @Column({
    type: DataType.JSONB,
    allowNull: true, // frozen threshold op/value/severity at eval time
  })
  threshold_snapshot?: MrmThresholdSnapshot;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  evaluated_at?: Date;

  constructor(init?: Partial<IMrmMetricEvaluation>) {
    super();
    Object.assign(this, init);
  }
}
