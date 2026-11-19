/**
 * Approval status of a use case risk. The same four values as an incident's
 * approval status (AIIncidentManagementApprovalStatus). Enforced by the
 * risks_approval_status_check constraint.
 */
export const RISK_APPROVAL_STATUSES = ["Pending", "Approved", "Rejected", "Not required"] as const;

export type RiskApprovalStatus = (typeof RISK_APPROVAL_STATUSES)[number];

export const RISK_APPROVAL_PENDING: RiskApprovalStatus = "Pending";
export const RISK_APPROVAL_APPROVED: RiskApprovalStatus = "Approved";
export const RISK_APPROVAL_REJECTED: RiskApprovalStatus = "Rejected";
export const RISK_APPROVAL_NOT_REQUIRED: RiskApprovalStatus = "Not required";

/** Approved and Rejected are decisions: only the approver or an Admin sets or undoes one. */
export const isRiskApprovalDecision = (status: RiskApprovalStatus): boolean =>
  status === RISK_APPROVAL_APPROVED || status === RISK_APPROVAL_REJECTED;

// Case, whitespace, underscores and hyphens are ignored, as in the
// risk-approval-status-values migration.
const matchKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();

const BY_KEY = new Map<string, RiskApprovalStatus>(
  RISK_APPROVAL_STATUSES.map((status) => [matchKey(status), status]),
);

/**
 * The allowed value `value` spells, or undefined when it is not one of the
 * four (legacy free text such as "In Progress", "", null, non-strings).
 */
export function normalizeRiskApprovalStatus(value: unknown): RiskApprovalStatus | undefined {
  if (typeof value !== "string") return undefined;
  return BY_KEY.get(matchKey(value));
}
