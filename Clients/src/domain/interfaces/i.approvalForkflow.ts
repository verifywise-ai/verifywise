import { IMenuItem } from "src/presentation/types/interfaces/i.menu";
import { ApprovalWorkflowStepModel } from "../models/Common/approvalWorkflow/approvalWorkflowStepModel";

export interface ApprovalButtonProps {
  label: string;
  count: number;
  onClick: () => void;
}

export interface NewApprovalWorkflowFormErrors {
  workflow_title?: string;
  entity?: string;
  steps: NewApprovalWorkflowStepFormErrors[];
}

export interface NewApprovalWorkflowStepFormErrors {
  step_name?: string;
  approver?: string;
  conditions?: string;
  sla_hours?: string;
}

export interface ICreateApprovalWorkflowProps {
  isOpen: boolean;
  setIsOpen: () => void;
  initialData?: {
    workflow_title: string;
    entity: number;
    steps: ApprovalWorkflowStepModel[];
    auto_approve_max_risk?: string | null;
  };
  isEdit?: boolean;
  onSuccess?: (data: {
    workflow_title: string;
    entity: number;
    steps: ApprovalWorkflowStepModel[];
    auto_approve_max_risk: string | null;
  }) => void;
}

export interface DetailFieldProps {
  label: string;
  value: string | string[];
  withWrap?: boolean;
}

export interface IRequestorApprovalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export interface ITimelineStep {
  id: number;
  stepNumber: number;
  title: string;
  status: "completed" | "pending" | "rejected";
  date?: string;
  approvers: ITimelineApprover[];
  dueAt?: string | null;
  escalatedAt?: string | null;
  isOverdue?: boolean;
}

export interface ITimelineApprover {
  id: number;
  name: string;
  result: "approved" | "rejected" | "pending";
  comment?: string;
}

export interface IMenuGroupExtended {
  name: string;
  items: IMenuItemExtended[];
}

export interface IMenuItemExtended extends IMenuItem {
  id: number;
  status: "approved" | "rejected" | "pending" | "withdrawn";
}
