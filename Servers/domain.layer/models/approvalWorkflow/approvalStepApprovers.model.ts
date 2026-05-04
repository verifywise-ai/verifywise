import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { IApprovalStepApproversAttributes } from "../../interfaces/i.approvalWorkflow";
import { UserModel } from "../user/user.model";
import { ApprovalWorkflowStepModel } from "./approvalWorkflowStep.model";

@Table({
  tableName: "approval_step_approvers",
  timestamps: false,
  underscored: true,
})
export class ApprovalStepApproversModel
  extends Model<ApprovalStepApproversModel>
  implements IApprovalStepApproversAttributes
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ApprovalWorkflowStepModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  workflow_step_id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  approver_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @BelongsTo(() => ApprovalWorkflowStepModel, "workflow_step_id")
  workflowStep?: ApprovalWorkflowStepModel;

  @BelongsTo(() => UserModel, "approver_id")
  approver?: UserModel;

  toJSON() {
    const values = this.get({ plain: true });
    return values;
  }
}
