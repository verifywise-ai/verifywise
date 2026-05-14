import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { ControlModel } from "../control/control.model";
import { SubcontrolModel } from "../subcontrol/subcontrol.model";

export type CcmControlHealthStatus = "pass" | "fail" | "warning" | "not_tested";

@Table({
  tableName: "ccm_control_health",
  timestamps: true,
  underscored: true,
})
export class CcmControlHealthModel extends Model<CcmControlHealthModel> {
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

  @ForeignKey(() => ControlModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  control_id!: number;

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
    type: DataType.ENUM("pass", "fail", "warning", "not_tested"),
    allowNull: false,
    defaultValue: "not_tested",
  })
  current_status?: CcmControlHealthStatus;

  @Column({
    type: DataType.DATE,
  })
  last_tested_at?: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  consecutive_passes?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  consecutive_failures?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  score?: number;

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

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;
}
