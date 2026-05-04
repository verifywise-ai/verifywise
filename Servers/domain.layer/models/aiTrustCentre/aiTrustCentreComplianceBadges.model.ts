import { IAITrustCentreOverview } from "../../interfaces/i.aiTrustCentreOverview";
import { Column, DataType, Model, Table } from "sequelize-typescript";

type IAITrustCentreOverviewComplianceBadges = IAITrustCentreOverview["compliance_badges"];

@Table({
  tableName: "ai_trust_center_compliance_badges",
  timestamps: true,
  underscored: true,
})
export class AITrustCenterComplianceBadgesModel
  extends Model<AITrustCenterComplianceBadgesModel>
  implements IAITrustCentreOverviewComplianceBadges
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
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  soc2_type_i!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  soc2_type_ii!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  iso_27001!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  iso_42001!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  ccpa!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  gdpr!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  hipaa!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  eu_ai_act!: boolean;

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
