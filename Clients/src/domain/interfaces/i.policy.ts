import { User } from "../types/User";
import { PolicyManagerModel } from "../models/Common/policy/policyManager.model";

export interface PolicyTableProps {
  data: PolicyManagerModel[];
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onLinkedObjects: (id: number) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  error?: Error | null;
  hidePagination?: boolean;
  flashRowId?: number | string | null;
}

export interface PolicyInput {
  title: string;
  status: string;
  tags?: string[];
  content_html: string;
  /** Date-only, "YYYY-MM-DD". */
  next_review_date?: string;
  policy_owner_id?: number | null;
  assigned_reviewer_ids?: number[];
}

/**
 * Form data structure for policy editing
 */
export interface PolicyFormData {
  title: string;
  status: string;
  tags: string[];
  nextReviewDate?: string;
  policyOwner: User | null;
  assignedReviewers: User[];
  content: string;
}

/**
 * Policy template structure
 */
export interface PolicyTemplate {
  title: string;
  tags: string[];
  content: string;
}

/**
 * Form validation errors structure
 */
export interface PolicyFormErrors {
  title?: string;
  status?: string;
  tags?: string;
  nextReviewDate?: string;
  policyOwner?: string;
  assignedReviewers?: string;
  content?: string;
}

// Note: Presentation-specific interfaces (PolicyTableProps, PolicyStatusCardProps,
// PolicyDetailModalProps, PolicyFormProps, PolicyManagerProps, PolicyTemplatesProps)
// have been moved to: presentation/types/interfaces/i.policy.ts

/** A workflow that can approve policies in the organization (GET /v1/policies/:id/approval). */
export interface PolicyUsableWorkflow {
  id: number;
  workflow_title: string;
  step_count: number;
}

/** The policy's pending approval request, if any. */
export interface PolicyPendingApprovalRequest {
  id: number;
  workflow_id: number;
  workflow_title: string;
  current_step: number;
  total_steps: number;
  requested_by: number;
  requested_by_name: string | null;
  created_at: string;
}

/** Approval state of one policy, as GET /api/v1/policies/:id/approval returns it. */
export interface PolicyApprovalState {
  usable_workflows: PolicyUsableWorkflow[];
  pending_request: PolicyPendingApprovalRequest | null;
  review_status: "pending_review" | "approved" | "changes_requested" | null;
  review_comment: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  can_submit: boolean;
  can_approve_directly: boolean;
  can_withdraw: boolean;
}
