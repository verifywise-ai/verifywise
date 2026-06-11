import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ISSOConfiguration, SSOProvider, AzureADConfigData } from "../../interfaces/i.ssoConfig";
import { OrganizationModel } from "../organization/organization.model";

@Table({
  tableName: "sso_configurations",
  timestamps: false,
})
export class SSOConfigurationModel
  extends Model<SSOConfigurationModel>
  implements ISSOConfiguration
{
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
    type: DataType.ENUM("AzureAD"),
    allowNull: false,
  })
  provider!: SSOProvider;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_enabled!: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  config_data!: AzureADConfigData;

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
