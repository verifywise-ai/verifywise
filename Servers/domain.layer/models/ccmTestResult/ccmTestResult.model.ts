import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { CcmControlTestModel } from "../ccmControlTest/ccmControlTest.model";
import { CcmConnectorModel } from "../ccmConnector/ccmConnector.model";
import { FileModel } from "../file/file.model";

export type CcmTestResultStatus = "pass" | "fail" | "error" | "not_tested";

@Table({
  tableName: "ccm_test_results",
  timestamps: false,
  underscored: true,
})
export class CcmTestResultModel extends Model<CcmTestResultModel> {
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

  @ForeignKey(() => CcmControlTestModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  test_id!: number;

  @ForeignKey(() => CcmConnectorModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  connector_id!: number;

  @Column({
    type: DataType.ENUM("pass", "fail", "error", "not_tested"),
    allowNull: false,
  })
  status!: CcmTestResultStatus;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  details_json!: Record<string, unknown>;

  @ForeignKey(() => FileModel)
  @Column({
    type: DataType.INTEGER,
  })
  evidence_file_id?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  executed_at!: Date;

  @Column({
    type: DataType.INTEGER,
  })
  duration_ms?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;
}
