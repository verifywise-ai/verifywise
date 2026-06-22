import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { UserModel } from "../user/user.model";

@Table({
  tableName: "ai_approval_rules",
  timestamps: true,
  underscored: true,
})
export class AiApprovalRuleModel extends Model<AiApprovalRuleModel> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id!: number;

  @ForeignKey(() => OrganizationModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  conditions!: Record<string, unknown>;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  event_type!: "auto-approve" | "require-approval" | "auto-reject";

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: {} })
  event_params?: Record<string, unknown>;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 100 })
  priority!: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  is_default!: boolean;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: true })
  created_by?: number;

  @BelongsTo(() => OrganizationModel, "organization_id")
  organization?: OrganizationModel;

  @BelongsTo(() => UserModel, "created_by")
  creator?: UserModel;
}
