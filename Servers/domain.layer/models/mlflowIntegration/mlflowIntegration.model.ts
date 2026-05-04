import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import {
  IMLFlowIntegration,
  MLFlowAuthMethod,
  MLFlowTestStatus,
} from "../../interfaces/i.mlflowIntegration";
import { UserModel } from "../user/user.model";

@Table({
  tableName: "mlflow_integrations",
  timestamps: true,
  underscored: true,
})
export class MLFlowIntegrationModel
  extends Model<MLFlowIntegrationModel>
  implements IMLFlowIntegration
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  tracking_server_url!: string;

  @Column({
    type: DataType.ENUM("none", "basic", "token"),
    allowNull: false,
    defaultValue: "none",
  })
  auth_method!: MLFlowAuthMethod;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  username?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  username_iv?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  password?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  password_iv?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  api_token?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  api_token_iv?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  verify_ssl!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 30,
  })
  timeout!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  last_tested_at?: Date | null;

  @Column({
    type: DataType.ENUM("success", "error"),
    allowNull: true,
  })
  last_test_status?: MLFlowTestStatus | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  last_test_message?: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  last_successful_test_at?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  last_failed_test_at?: Date | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  last_failed_test_message?: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  last_synced_at?: Date | null;

  @Column({
    type: DataType.ENUM("success", "partial", "error"),
    allowNull: true,
  })
  last_sync_status?: "success" | "partial" | "error" | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  last_sync_message?: string | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  updated_by?: number | null;

  @BelongsTo(() => UserModel)
  updatedByUser?: UserModel;

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
