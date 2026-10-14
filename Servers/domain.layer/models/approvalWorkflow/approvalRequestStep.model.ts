import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { IApprovalRequestStepAttributes } from "../../interfaces/i.approvalWorkflow";
import { ApprovalStepStatus } from "../../enums/approval-workflow.enum";
import { ApprovalRequestModel } from "./approvalRequest.model";
import { ApprovalRequestStepApprovalModel } from "./approvalRequestStepApproval.model";
import { UserModel } from "../user/user.model";

@Table({
  tableName: "approval_request_steps",
  timestamps: false,
  underscored: true,
})
export class ApprovalRequestStepModel
  extends Model<ApprovalRequestStepModel>
  implements IApprovalRequestStepAttributes
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ApprovalRequestModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  request_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  step_number!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  step_name!: string;

  @Column({
    type: DataType.ENUM(...Object.values(ApprovalStepStatus)),
    allowNull: false,
    defaultValue: ApprovalStepStatus.PENDING,
  })
  status!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  sla_hours?: number | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  escalation_user_id?: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  due_at?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  escalated_at?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  date_assigned?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  date_completed?: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  step_details?: any;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @BelongsTo(() => ApprovalRequestModel, "request_id")
  request?: ApprovalRequestModel;

  @BelongsTo(() => UserModel, "escalation_user_id")
  escalationUser?: UserModel;

  @HasMany(() => ApprovalRequestStepApprovalModel, "request_step_id")
  approvals?: ApprovalRequestStepApprovalModel[];

  async markAsCompleted() {
    this.status = ApprovalStepStatus.COMPLETED;
    this.date_completed = new Date();
  }

  async markAsRejected() {
    this.status = ApprovalStepStatus.REJECTED;
    this.date_completed = new Date();
  }

  toJSON() {
    const values = this.get({ plain: true });
    return values;
  }
}
