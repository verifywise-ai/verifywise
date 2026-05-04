import { IAITrustCentreOverview } from "../../interfaces/i.aiTrustCentreOverview";
import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { FileModel } from "../file/file.model";

type IAITrustCentreOverviewInfo = IAITrustCentreOverview["info"];

@Table({
  tableName: "ai_trust_center_info",
  timestamps: true,
  underscored: true,
})
export class AITrustCenterInfoModel
  extends Model<AITrustCenterInfoModel>
  implements IAITrustCentreOverviewInfo
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
  title!: string;

  @ForeignKey(() => FileModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  logo?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  visible!: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  header_color!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  intro_visible!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  compliance_badges_visible!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  company_description_visible!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  terms_and_contact_visible!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  resources_visible!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  subprocessor_visible!: boolean;

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
