// NOTE: the ENUM types (enum_mrm_threshold_op/severity, enum_mrm_breach_action) are created
// schema-qualified as `verifywise.*` in raw SQL migrations. Never use Sequelize's ENUM alter
// helpers (changeColumn) for these — they look in `public` and fail. Alter them only via raw
// SQL migrations with the `verifywise.` prefix.
import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmThreshold } from "../../interfaces/i.mrmThreshold";
import {
  MrmBreachAction,
  MrmThresholdOp,
  MrmThresholdSeverity,
} from "../../enums/mrmMonitoring.enum";

@Table({
  tableName: "mrm_thresholds",
  timestamps: true,
  underscored: true,
})
export class MrmThresholdModel extends Model<MrmThresholdModel> implements IMrmThreshold {
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
    type: DataType.STRING(100),
    allowNull: true, // null = 'overall'
  })
  segment?: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true, // null = any window
  })
  window?: string;

  @Column({
    type: DataType.ENUM(...Object.values(MrmThresholdOp)),
    allowNull: false,
  })
  op!: MrmThresholdOp;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true, // used by gt/gte/lt/lte
  })
  value_num?: number;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true, // 'outside' band low
  })
  value_lo?: number;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true, // 'outside' band high
  })
  value_hi?: number;

  @Column({
    type: DataType.ENUM(...Object.values(MrmThresholdSeverity)),
    allowNull: false,
    defaultValue: MrmThresholdSeverity.WARN,
  })
  severity!: MrmThresholdSeverity;

  @Column({
    type: DataType.ENUM(...Object.values(MrmBreachAction)),
    allowNull: false,
    defaultValue: MrmBreachAction.NOTIFY,
  })
  breach_action!: MrmBreachAction;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  active!: boolean;

  // created_at / updated_at are managed by Sequelize (timestamps: true) — not declared here.

  constructor(init?: Partial<IMrmThreshold>) {
    super();
    Object.assign(this, init);
  }
}
