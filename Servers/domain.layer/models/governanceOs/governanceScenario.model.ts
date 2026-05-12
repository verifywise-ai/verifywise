import { Table, Column, Model, DataType, HasMany } from "sequelize-typescript";
import { IGovernanceScenarioAttributes } from "../../interfaces/i.governanceOs";
import { GovernanceScenarioRuleModel } from "./governanceScenarioRule.model";

@Table({
  tableName: "governance_scenarios",
  timestamps: true,
  underscored: true,
})
export class GovernanceScenarioModel
  extends Model<GovernanceScenarioModel>
  implements IGovernanceScenarioAttributes
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  organization_id?: number | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  industry?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  use_case_type?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  region?: string;

  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: true,
  })
  recommended_framework_ids?: number[];

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  priority_order?: Record<string, unknown>;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  rationale?: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_builtin?: boolean;

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

  @HasMany(() => GovernanceScenarioRuleModel, "scenario_id")
  rules?: GovernanceScenarioRuleModel[];
}
