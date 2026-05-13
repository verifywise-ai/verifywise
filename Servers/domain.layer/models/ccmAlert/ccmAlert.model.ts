import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { CcmTestResultModel } from "../ccmTestResult/ccmTestResult.model";
import { ControlModel } from "../control/control.model";
import { SubcontrolModel } from "../subcontrol/subcontrol.model";
import { UserModel } from "../user/user.model";

export type CcmAlertSeverity = "critical" | "high" | "medium" | "low";
export type CcmAlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

@Table({
  tableName: "ccm_alerts",
  timestamps: true,
  underscored: true,
})
export class CcmAlertModel extends Model<CcmAlertModel> {
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

  @ForeignKey(() => CcmTestResultModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  test_result_id!: number;

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
    type: DataType.ENUM("critical", "high", "medium", "low"),
    allowNull: false,
  })
  severity!: CcmAlertSeverity;

  @Column({
    type: DataType.ENUM("open", "acknowledged", "resolved", "dismissed"),
    allowNull: false,
    defaultValue: "open",
  })
  status?: CcmAlertStatus;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  assigned_to?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  message!: string;

  @Column({
    type: DataType.DATE,
  })
  resolved_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;
}
