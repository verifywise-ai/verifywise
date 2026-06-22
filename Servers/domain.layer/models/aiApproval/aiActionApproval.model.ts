import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { OrganizationModel } from "../organization/organization.model";
import { UserModel } from "../user/user.model";

export interface StateHistoryEntry {
  state: string;
  timestamp: string;
  actor?: string;
  reason?: string;
}

@Table({
  tableName: "ai_action_approvals",
  timestamps: true,
  underscored: true,
})
export class AiActionApprovalModel extends Model<AiActionApprovalModel> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => OrganizationModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  action_type!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  tool_name!: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  input_params!: Record<string, unknown>;

  @Column({ type: DataType.STRING(20), allowNull: false })
  risk_level!: string;

  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: "idle" })
  state!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  rule_matched?: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: true })
  requested_by?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  approved_by?: number;

  @Column({ type: DataType.DATE, allowNull: true })
  approved_at?: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  executed_at?: Date;

  @Column({ type: DataType.JSONB, allowNull: true })
  result?: unknown;

  @Column({ type: DataType.TEXT, allowNull: true })
  error_message?: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  state_history!: StateHistoryEntry[];

  @Column({ type: DataType.INTEGER, allowNull: true })
  approval_request_id?: number;

  @BelongsTo(() => OrganizationModel, "organization_id")
  organization?: OrganizationModel;

  @BelongsTo(() => UserModel, "requested_by")
  requestor?: UserModel;
}
