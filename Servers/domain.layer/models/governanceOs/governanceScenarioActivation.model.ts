import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { IGovernanceScenarioActivationAttributes } from "../../interfaces/i.governanceOs";
import { GovernanceScenarioModel } from "./governanceScenario.model";

@Table({
  tableName: "governance_scenario_activations",
  timestamps: true,
  underscored: true,
})
export class GovernanceScenarioActivationModel
  extends Model<GovernanceScenarioActivationModel>
  implements IGovernanceScenarioActivationAttributes
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

  @ForeignKey(() => GovernanceScenarioModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  scenario_id!: number;

  @BelongsTo(() => GovernanceScenarioModel)
  scenario?: GovernanceScenarioModel;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  activated_by?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  activated_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  deactivated_at?: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  tasks_created?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  frameworks_assigned?: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "active",
  })
  status?: string;

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
