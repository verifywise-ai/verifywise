export interface MockApprovalWorkflow {
  id: number;
  workflow_title: string;
  entity_type: string;
  description: string;
  steps: Array<{
    step_name: string;
    approver_ids: number[];
    requires_all_approvers: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface MockApprovalRequest {
  id: number;
  request_name: string;
  workflow_id: number;
  status: "pending" | "approved" | "rejected";
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export function createMockApprovalWorkflow(
  overrides: Partial<MockApprovalWorkflow> = {},
): MockApprovalWorkflow {
  return {
    id: 1,
    workflow_title: "Vendor Approval Workflow",
    entity_type: "vendor",
    description: "Standard approval flow for new vendors",
    steps: [
      {
        step_name: "Review",
        approver_ids: [1],
        requires_all_approvers: false,
      },
    ],
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export function createMockApprovalRequest(
  overrides: Partial<MockApprovalRequest> = {},
): MockApprovalRequest {
  return {
    id: 1,
    request_name: "Approve New Vendor",
    workflow_id: 1,
    status: "pending",
    createdBy: 1,
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export const mockApprovalWorkflows: MockApprovalWorkflow[] = [createMockApprovalWorkflow()];
export const mockApprovalRequests: MockApprovalRequest[] = [createMockApprovalRequest()];
