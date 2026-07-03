import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmMetricKey } from "../../interfaces/i.mrmMetricKey";

@Table({
  tableName: "mrm_metric_keys",
  timestamps: false,
  underscored: true,
})
export class MrmMetricKeyModel extends Model<MrmMetricKeyModel> implements IMrmMetricKey {
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
    type: DataType.STRING(100),
    allowNull: false,
  })
  key!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  display_name?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  constructor(init?: Partial<IMrmMetricKey>) {
    super();
    Object.assign(this, init);
  }
}
