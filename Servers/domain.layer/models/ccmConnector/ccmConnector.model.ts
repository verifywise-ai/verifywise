import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { UserModel } from "../user/user.model";

export type CcmConnectorStatus = "active" | "inactive" | "error";
export type CcmConnectorTestStatus = "success" | "failed";

@Table({
  tableName: "ccm_connectors",
  timestamps: true,
  underscored: true,
})
export class CcmConnectorModel extends Model<CcmConnectorModel> {
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

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  type!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  config!: Record<string, unknown>;

  @Column({
    type: DataType.ENUM("active", "inactive", "error"),
    allowNull: false,
    defaultValue: "active",
  })
  status?: CcmConnectorStatus;

  @Column({
    type: DataType.DATE,
  })
  last_tested_at?: Date;

  @Column({
    type: DataType.ENUM("success", "failed"),
  })
  last_test_status?: CcmConnectorTestStatus;

  @Column({
    type: DataType.TEXT,
  })
  last_error_message?: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  created_by?: number;

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
