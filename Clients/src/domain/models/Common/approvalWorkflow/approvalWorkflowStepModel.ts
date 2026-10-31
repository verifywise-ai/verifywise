export class ApprovalWorkflowStepModel {
  step_name?: string;
  approver_ids?: number[];
  requires_all_approvers?: boolean;
  description?: string;
  sla_hours?: number | null;
  escalation_user_id?: number | null;

  constructor(data?: any) {
    this.step_name = data?.step_name;

    // Map approvers array to approver_ids if backend data
    if (data?.approvers && Array.isArray(data.approvers)) {
      this.approver_ids = data.approvers.map((a: any) => a.approver_id);
    } else {
      this.approver_ids = data?.approver_ids || [];
    }

    this.requires_all_approvers = data?.requires_all_approvers ?? false;
    this.description = data?.description;
    this.sla_hours = data?.sla_hours ?? null;
    this.escalation_user_id = data?.escalation_user_id ?? null;
  }
}
