import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmRevalidationEvent } from "../../interfaces/i.mrmRevalidationEvent";
import { MrmRevalidationTriggerSource } from "../../enums/mrmMonitoring.enum";

/**
 * An immutable revalidation-trigger firing (append-only audit log).
 * `timestamps: false` — the only timestamps are fired_at and created_at; there
 * is no updated_at (rows are never mutated).
 */
@Table({
  tableName: "mrm_revalidation_events",
  timestamps: false,
  underscored: true,
})
export class MrmRevalidationEventModel
  extends Model<MrmRevalidationEventModel>
  implements IMrmRevalidationEvent
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
  model_inventory_id!: number;

  @Column({
    type: DataType.ENUM(...Object.values(MrmRevalidationTriggerSource)),
    allowNull: false,
  })
  trigger_source!: MrmRevalidationTriggerSource;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  reason?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // null = no-op firing, or the task was later deleted (SET NULL)
  })
  resulting_validation_id?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  created_validation!: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true, // optional audit context (breach eval id, change record, tier)
  })
  source_ref?: Record<string, unknown>;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  fired_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  constructor(init?: Partial<IMrmRevalidationEvent>) {
    super();
    Object.assign(this, init);
  }
}
