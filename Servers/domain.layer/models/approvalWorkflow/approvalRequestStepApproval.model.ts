import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { IApprovalRequestStepApprovalAttributes } from "../../interfaces/i.approvalWorkflow";
import { ApprovalResult } from "../../enums/approval-workflow.enum";
import { UserModel } from "../user/user.model";
import { ApprovalRequestStepModel } from "./approvalRequestStep.model";

@Table({
  tableName: "approval_request_step_approvals",
  timestamps: false,
  underscored: true,
})
export class ApprovalRequestStepApprovalModel
  extends Model<ApprovalRequestStepApprovalModel>
  implements IApprovalRequestStepApprovalAttributes
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ApprovalRequestStepModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  request_step_id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  approver_id!: number;

  @Column({
    type: DataType.ENUM(...Object.values(ApprovalResult)),
    allowNull: true,
  })
  approval_result?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  comments?: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  approved_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @BelongsTo(() => ApprovalRequestStepModel, "request_step_id")
  requestStep?: ApprovalRequestStepModel;

  @BelongsTo(() => UserModel, "approver_id")
  approver?: UserModel;

  toJSON() {
    const values = this.get({ plain: true });
    return values;
  }
}
