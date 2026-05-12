import { Table, Column, Model, DataType } from "sequelize-typescript";
import {
  IGovernanceControlMappingAttributes,
  MappingStrength,
  MappingDirection,
  ControlType,
} from "../../interfaces/i.governanceOs";

@Table({
  tableName: "governance_control_mappings",
  timestamps: true,
  underscored: true,
})
export class GovernanceControlMappingModel
  extends Model<GovernanceControlMappingModel>
  implements IGovernanceControlMappingAttributes
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
  source_framework_id!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  source_control_type!: ControlType;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  source_control_identifier!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  source_control_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  target_framework_id!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  target_control_type!: ControlType;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  target_control_identifier!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  target_control_id?: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "related",
  })
  mapping_strength!: MappingStrength;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "bidirectional",
  })
  mapping_direction!: MappingDirection;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  domain_tag?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  rationale?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  source_reference?: string;

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    defaultValue: 0.8,
  })
  confidence_score?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  updated_at?: Date;
}
