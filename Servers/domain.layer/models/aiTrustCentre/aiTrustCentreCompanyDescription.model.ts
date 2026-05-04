import { IAITrustCentreOverview } from "../../interfaces/i.aiTrustCentreOverview";
import { Column, DataType, Model, Table } from "sequelize-typescript";

type IAITrustCentreOverviewCompanyDescription = IAITrustCentreOverview["company_description"];

@Table({
  tableName: "ai_trust_center_company_description",
  timestamps: true,
  underscored: true,
})
export class AITrustCenterCompanyDescriptionModel
  extends Model<AITrustCenterCompanyDescriptionModel>
  implements IAITrustCentreOverviewCompanyDescription
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  background_visible!: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  background_text!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  core_benefits_visible!: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  core_benefits_text!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  compliance_doc_visible!: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  compliance_doc_text!: string;

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
