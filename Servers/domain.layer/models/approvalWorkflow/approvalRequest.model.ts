import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { IApprovalRequestAttributes } from "../../interfaces/i.approvalWorkflow";
import { EntityType, ApprovalRequestStatus } from "../../enums/approval-workflow.enum";
import { UserModel } from "../user/user.model";
import { ApprovalWorkflowModel } from "./approvalWorkflow.model";
import { ApprovalRequestStepModel } from "./approvalRequestStep.model";

@Table({
  tableName: "approval_requests",
  timestamps: true,
  underscored: true,
})
export class ApprovalRequestModel
  extends Model<ApprovalRequestModel>
  implements IApprovalRequestAttributes
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  request_name!: string;

  @ForeignKey(() => ApprovalWorkflowModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  workflow_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  entity_id?: number;

  @Column({
    type: DataType.ENUM(...Object.values(EntityType)),
    allowNull: true,
  })
  entity_type?: EntityType;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  entity_data?: any;

  @Column({
    type: DataType.ENUM(...Object.values(ApprovalRequestStatus)),
    allowNull: false,
    defaultValue: ApprovalRequestStatus.PENDING,
  })
  status!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  requested_by!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  current_step?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  auto_approved_at?: Date | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  auto_approval_risk_level?: string | null;

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

  @BelongsTo(() => ApprovalWorkflowModel, "workflow_id")
  workflow?: ApprovalWorkflowModel;

  @BelongsTo(() => UserModel, "requested_by")
  requestor?: UserModel;

  @HasMany(() => ApprovalRequestStepModel, "request_id")
  steps?: ApprovalRequestStepModel[];

  toJSON() {
    const values = this.get({ plain: true });
    return values;
  }
}
