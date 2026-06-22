import { Table, Column, Model, DataType } from "sequelize-typescript";
import { IGovernanceCoverageCacheAttributes } from "../../interfaces/i.governanceOs";

@Table({
  tableName: "governance_coverage_cache",
  timestamps: false,
  underscored: true,
})
export class GovernanceCoverageCacheModel
  extends Model<GovernanceCoverageCacheModel>
  implements IGovernanceCoverageCacheAttributes
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
  project_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  framework_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  total_controls!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  mapped_controls!: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.0,
  })
  coverage_percentage!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  gap_details?: Record<string, unknown>;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  synergy_details?: Record<string, unknown>;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  calculation_methodology?: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    defaultValue: DataType.NOW,
  })
  computed_at?: Date;
}
