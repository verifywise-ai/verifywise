import { EntityType } from "../enums/approval-workflow.enum";
import { AiRiskClassification } from "../enums/ai-risk-classification.enum";

export interface IApprovalWorkflowAttributes {
  id?: number;
  workflow_title: string;
  entity_type: EntityType;
  description?: string;
  auto_approve_max_risk?: AiRiskClassification | null;
  is_active?: boolean;
  created_by?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IApprovalWorkflowStepAttributes {
  id?: number;
  workflow_id: number;
  step_number: number;
  step_name: string;
  description?: string;
  requires_all_approvers?: boolean;
  sla_hours?: number | null;
  escalation_user_id?: number | null;
  created_at?: Date;
}

export interface IApprovalStepApproversAttributes {
  id?: number;
  workflow_step_id: number;
  approver_id: number;
  created_at?: Date;
}

export interface IApprovalRequestAttributes {
  id?: number;
  request_name: string;
  workflow_id: number;
  entity_id?: number;
  entity_type?: EntityType;
  entity_data?: any;
  status: string;
  requested_by: number;
  current_step?: number;
  auto_approved_at?: Date | null;
  auto_approval_risk_level?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface IApprovalRequestStepAttributes {
  id?: number;
  request_id: number;
  step_number: number;
  step_name: string;
  status: string;
  sla_hours?: number | null;
  escalation_user_id?: number | null;
  due_at?: Date | null;
  escalated_at?: Date | null;
  date_assigned?: Date;
  date_completed?: Date;
  step_details?: any;
  created_at?: Date;
}

export interface IApprovalRequestStepApprovalAttributes {
  id?: number;
  request_step_id: number;
  approver_id: number;
  approval_result?: string;
  comments?: string;
  approved_at?: Date;
  created_at?: Date;
}
