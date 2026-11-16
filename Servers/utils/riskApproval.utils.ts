/**
 * Who may decide a risk's approval, and what its approval status becomes on a
 * save (audit decision 5, rulings K2-K4).
 *
 * - Naming an approver sets the status to Pending, unless the caller is that
 *   approver or an Admin and asks for Approved or Rejected in the same save.
 * - Clearing the approver sets Not required. A risk with no approver is always
 *   Not required: an approval needs an approver.
 * - Setting Approved or Rejected, or moving away from either, needs the
 *   approver or an Admin. A status sent back unchanged is not a decision.
 * - A submitted value that is not one of the four is ignored, so old clients
 *   that send "In Progress" or "" keep working (the route is frozen).
 */

import {
  isRiskApprovalDecision,
  normalizeRiskApprovalStatus,
  RISK_APPROVAL_NOT_REQUIRED,
  RISK_APPROVAL_PENDING,
  RiskApprovalStatus,
} from "../domain.layer/enums/risk-approval-status.enum";
import { roleHasPermission } from "./rolePermissions.utils";

export const RISK_APPROVAL_FORBIDDEN_MESSAGE =
  "Only the risk's approver or an Admin can approve or reject it.";

export class RiskApprovalForbiddenError extends Error {
  constructor() {
    super(RISK_APPROVAL_FORBIDDEN_MESSAGE);
    this.name = "RiskApprovalForbiddenError";
  }
}

export interface ResolveRiskApprovalArgs {
  /** The stored risk, or null on create. */
  existing: { risk_approval: number | null; approval_status: string | null } | null;
  /** What the caller sent. An absent key means "not supplied". */
  submitted: { risk_approval?: number | string | null; approval_status?: unknown };
  callerId: number;
  callerIsAdmin: boolean;
}

export interface ResolvedRiskApproval {
  risk_approval: number | null;
  approval_status: RiskApprovalStatus;
  /** The new approver when the save names a different one, else null. */
  approverChangedTo: number | null;
}

/** A user id, or null for none (null, "", 0 and anything not a positive integer). */
function toApproverId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The approver and approval status a save stores. Throws
 * RiskApprovalForbiddenError when the caller may not make the decision they
 * asked for.
 */
export function resolveRiskApproval({
  existing,
  submitted,
  callerId,
  callerIsAdmin,
}: ResolveRiskApprovalArgs): ResolvedRiskApproval {
  const currentApprover = toApproverId(existing?.risk_approval);
  const currentStatus =
    normalizeRiskApprovalStatus(existing?.approval_status) ?? RISK_APPROVAL_NOT_REQUIRED;

  const approverSubmitted = submitted.risk_approval !== undefined;
  const nextApprover = approverSubmitted ? toApproverId(submitted.risk_approval) : currentApprover;
  const approverChanged = nextApprover !== currentApprover;

  const requested = normalizeRiskApprovalStatus(submitted.approval_status);
  const statusChangeRequested = requested !== undefined && requested !== currentStatus;
  const callerDecides = callerIsAdmin || (nextApprover !== null && nextApprover === callerId);

  let status: RiskApprovalStatus;
  if (approverChanged) {
    // K4: a new approver resets the status; the reset needs no permission.
    if (statusChangeRequested && isRiskApprovalDecision(requested!)) {
      if (!callerDecides) throw new RiskApprovalForbiddenError();
      status = requested!;
    } else {
      status = RISK_APPROVAL_PENDING;
    }
  } else if (statusChangeRequested) {
    // K3: a decision, or undoing one, needs the approver or an Admin.
    if (
      (isRiskApprovalDecision(requested!) || isRiskApprovalDecision(currentStatus)) &&
      !callerDecides
    ) {
      throw new RiskApprovalForbiddenError();
    }
    status = requested!;
  } else {
    status = currentStatus;
  }

  if (nextApprover === null) status = RISK_APPROVAL_NOT_REQUIRED;

  return {
    risk_approval: nextApprover,
    approval_status: status,
    approverChangedTo: approverChanged ? nextApprover : null,
  };
}

/** Whether the caller's role can decide any risk's approval (organization.admin). */
export async function callerCanDecideAnyRisk(
  organizationId: number | null,
  role: string,
): Promise<boolean> {
  if (!role) return false;
  return roleHasPermission(organizationId, role, "organization.admin");
}
