import {
  Table,
  Column,
  Model,
  DataType,
  HasMany,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { IApprovalWorkflowAttributes } from "../../interfaces/i.approvalWorkflow";
import { EntityType } from "../../enums/approval-workflow.enum";
import { AiRiskClassification } from "../../enums/ai-risk-classification.enum";
import { UserModel } from "../user/user.model";
import { ApprovalWorkflowStepModel } from "./approvalWorkflowStep.model";

@Table({
  tableName: "approval_workflows",
  timestamps: true,
  underscored: true,
})
export class ApprovalWorkflowModel
  extends Model<ApprovalWorkflowModel>
  implements IApprovalWorkflowAttributes
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
  workflow_title!: string;

  @Column({
    type: DataType.ENUM(...Object.values(EntityType)),
    allowNull: false,
  })
  entity_type!: EntityType;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  auto_approve_max_risk?: AiRiskClassification | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  is_active?: boolean;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  created_by?: number;

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

  @BelongsTo(() => UserModel, "created_by")
  creator?: UserModel;

  @HasMany(() => ApprovalWorkflowStepModel, "workflow_id")
  steps?: ApprovalWorkflowStepModel[];

  toJSON() {
    const values = this.get({ plain: true });
    return values;
  }
}
