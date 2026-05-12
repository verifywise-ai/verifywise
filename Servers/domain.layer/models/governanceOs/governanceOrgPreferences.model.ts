import { Table, Column, Model, DataType } from "sequelize-typescript";
import { IGovernanceOrgPreferencesAttributes } from "../../interfaces/i.governanceOs";

@Table({
  tableName: "governance_org_preferences",
  timestamps: true,
  underscored: true,
})
export class GovernanceOrgPreferencesModel
  extends Model<GovernanceOrgPreferencesModel>
  implements IGovernanceOrgPreferencesAttributes
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
    unique: true,
  })
  organization_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  selected_scenario_id?: number | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  custom_framework_priority?: Record<string, unknown>;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  active_mapping_filters?: Record<string, unknown>;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_enabled?: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  dont_ask_governance_os?: boolean;

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
