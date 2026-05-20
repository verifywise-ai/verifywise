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
  next_review_date?: Date | undefined;
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
