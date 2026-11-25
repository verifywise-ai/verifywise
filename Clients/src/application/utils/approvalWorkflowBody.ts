import { ApprovalWorkflowStepModel } from "../../domain/models/Common/approvalWorkflow/approvalWorkflowStepModel";

/** Entity ids of the approval workflow form (`Modals/NewApprovalWorkflow/arrays.ts`). */
export const USE_CASE_WORKFLOW_ENTITY_ID = 1;

/** Entity id in the workflow form → the `entity_type` the API stores. */
const ENTITY_TYPE_BY_ID: Record<number, string> = {
  1: "use_case",
  2: "file",
  3: "risk",
  4: "vendor",
  5: "model_inventory",
  6: "policy",
  7: "incident",
  8: "task",
  9: "dataset",
  10: "training",
  11: "evidence",
  12: "ai_action",
  13: "automation",
  14: "pmm_config",
  15: "note",
};

/** The `entity_type` for a form entity id; an unknown id falls back to a use case. */
export function approvalWorkflowEntityType(entityId: number): string {
  return ENTITY_TYPE_BY_ID[Number(entityId)] ?? "use_case";
}

/** What the approval workflow modal hands back on save. */
export interface ApprovalWorkflowFormData {
  workflow_title: string;
  entity: number;
  steps: ApprovalWorkflowStepModel[];
  auto_approve_max_risk: string | null;
}

export interface ApprovalWorkflowRequestBody {
  workflow_title: string;
  entity_type: string;
  auto_approve_max_risk: string | null;
  steps: Array<{
    step_name: string | undefined;
    description: string | undefined;
    approver_ids: number[];
    requires_all_approvers: boolean;
    sla_hours: number | null;
    escalation_user_id: number | null;
  }>;
}

/**
 * The create and update body for an approval workflow. Only use case
 * workflows carry an auto-approve threshold; the server rejects it elsewhere.
 */
export function buildApprovalWorkflowBody(
  formData: ApprovalWorkflowFormData,
): ApprovalWorkflowRequestBody {
  const entityType = approvalWorkflowEntityType(formData.entity);
  return {
    workflow_title: formData.workflow_title,
    entity_type: entityType,
    auto_approve_max_risk:
      entityType === "use_case" ? (formData.auto_approve_max_risk ?? null) : null,
    steps: formData.steps.map((step) => ({
      step_name: step.step_name,
      description: step.description,
      approver_ids: step.approver_ids || [],
      requires_all_approvers: step.requires_all_approvers ?? false,
      sla_hours: step.sla_hours ?? null,
      escalation_user_id: step.escalation_user_id ?? null,
    })),
  };
}
