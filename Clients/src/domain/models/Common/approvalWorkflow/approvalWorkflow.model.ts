import { ApprovalStatus } from "../../../enums/aiApprovalWorkflow.enum";
import { ApprovalWorkflowStepModel } from "./approvalWorkflowStepModel";

export class ApprovalWorkflowModel {
  id!: number;
  type!: string;
  workflow_title?: string;
  entity?: number;
  entity_type?: string;
  steps?: ApprovalWorkflowStepModel[];
  approval_status!: ApprovalStatus;
  date_updated?: Date;
  updated_at?: Date;

  constructor(data: any) {
    this.id = data.id;
    this.type = data.type;
    this.workflow_title = data.workflow_title;
    // Map entity_type to entity number
    if (data.entity_type) {
      this.entity_type = data.entity_type;
      switch (data.entity_type) {
        case "use_case":
          this.entity = 1;
          break;
        case "file":
          this.entity = 2;
          break;
        default:
          this.entity = 1;
      }
    } else {
      this.entity = data.entity;
    }
    // Process steps through the model constructor to map approvers properly
    if (data.steps && Array.isArray(data.steps)) {
      this.steps = data.steps.map((step: any) => new ApprovalWorkflowStepModel(step));
    } else {
      this.steps = [];
    }
    this.approval_status = data.approval_status;
    // Map updated_at/updatedAt to date_updated (backend uses camelCase from Sequelize)
    this.date_updated = data.date_updated || data.updated_at || data.updatedAt;
    this.updated_at = data.updated_at || data.updatedAt;
  }
}
