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
}

export interface ICreateApprovalWorkflowProps {
  isOpen: boolean;
  setIsOpen: () => void;
  initialData?: {
    workflow_title: string;
    entity: number;
    steps: ApprovalWorkflowStepModel[];
  };
  isEdit?: boolean;
  onSuccess?: (data: {
    workflow_title: string;
    entity: number;
    steps: ApprovalWorkflowStepModel[];
  }) => void;
}

export interface DetailFieldProps {
  label: string;
  value: string | string[];
  withWrap?: boolean;
}

export interface IStepDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stepDetails: IStepDetails | null;
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
  approverName?: string;
  date?: string;
  comment?: string;
  showDetailsLink?: boolean;
  approvalResult?: "approved" | "rejected" | "pending";
}

export interface IStepDetails {
  stepId: number;
  owner: string;
  teamMembers: string[];
  location: string;
  startDate: string;
  targetIndustry: string;
  description: string;
}

export interface IMenuGroupExtended {
  name: string;
  items: IMenuItemExtended[];
}

export interface IMenuItemExtended extends IMenuItem {
  id: number;
  status: "approved" | "rejected" | "pending" | "withdrawn";
}
