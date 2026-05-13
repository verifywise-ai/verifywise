import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { CcmConnectorModel } from "../ccmConnector/ccmConnector.model";
import { ControlModel } from "../control/control.model";
import { SubcontrolModel } from "../subcontrol/subcontrol.model";

export type CcmTestSeverity = "critical" | "high" | "medium" | "low";

@Table({
  tableName: "ccm_control_tests",
  timestamps: true,
  underscored: true,
})
export class CcmControlTestModel extends Model<CcmControlTestModel> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @ForeignKey(() => CcmConnectorModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  connector_id!: number;

  @ForeignKey(() => ControlModel)
  @Column({
    type: DataType.INTEGER,
  })
  control_id?: number;

  @ForeignKey(() => SubcontrolModel)
  @Column({
    type: DataType.INTEGER,
  })
  subcontrol_id?: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  framework_type!: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  test_type!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  test_config!: Record<string, unknown>;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "0 * * * *",
  })
  schedule_cron!: string;

  @Column({
    type: DataType.ENUM("critical", "high", "medium", "low"),
    allowNull: false,
    defaultValue: "medium",
  })
  severity?: CcmTestSeverity;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  is_active?: boolean;

  @Column({
    type: DataType.DATE,
  })
  last_run_at?: Date;

  @Column({
    type: DataType.DATE,
  })
  next_run_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;
}
