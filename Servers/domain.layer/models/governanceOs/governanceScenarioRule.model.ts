import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { IGovernanceScenarioRuleAttributes } from "../../interfaces/i.governanceOs";
import { GovernanceScenarioModel } from "./governanceScenario.model";

@Table({
  tableName: "governance_scenario_rules",
  timestamps: false,
  underscored: true,
})
export class GovernanceScenarioRuleModel
  extends Model<GovernanceScenarioRuleModel>
  implements IGovernanceScenarioRuleAttributes
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => GovernanceScenarioModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  scenario_id!: number;

  @BelongsTo(() => GovernanceScenarioModel)
  scenario?: GovernanceScenarioModel;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  rule_type!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "equals",
  })
  rule_operator!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  rule_value!: string;

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: false,
    defaultValue: 0.5,
  })
  weight!: number;
}
