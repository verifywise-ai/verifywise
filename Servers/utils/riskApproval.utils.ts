/**
 * Who may decide a risk's approval, and what its approval status becomes on a
 * save (audit decision 5, rulings K2, K3, K4, K9). "Decides" means the
 * caller is an Admin or the risk's SAVED approver, never the approver the
 * same save names.
 *
 * - R1: while the risk has a saved approver, any change of its approval
 *   status needs a caller who decides. Sending the stored value back is not
 *   a change.
 * - R2: changing the approver (to someone else or to nobody) of an Approved
 *   or Rejected risk needs a caller who decides; on a Pending or Not required
 *   risk anyone who can edit it may. A new approver sets Pending; only an
 *   Admin may set Approved or Rejected in that same save. Clearing the
 *   approver sets Not required.
 * - R3: a non-Admin may not name themself as the new approver. Keeping
 *   yourself when you already are the saved approver is fine.
 * - R4: with no approver before or after the save, Not required is the only
 *   status a save can set; a request for another value is ignored. An
 *   unrelated save keeps the stored status, so a legacy Approved risk whose
 *   approver was deleted keeps it.
 * - A submitted value that is not one of the four is ignored, so old clients
 *   that send "In Progress" or "" keep working (the route is frozen).
 */

import { ForbiddenException } from "../domain.layer/exceptions/custom.exception";
import {
  isRiskApprovalDecision,
  normalizeRiskApprovalStatus,
  RISK_APPROVAL_NOT_REQUIRED,
  RISK_APPROVAL_PENDING,
  RiskApprovalStatus,
} from "../domain.layer/enums/risk-approval-status.enum";
import { roleIsOrganizationAdmin } from "./organizationAdmin.utils";

export const RISK_APPROVAL_FORBIDDEN_MESSAGE =
  "Only the risk's approver or an Admin can change its approval.";

export const RISK_APPROVAL_SELF_APPROVER_MESSAGE =
  "You can't name yourself as the approver. Ask an Admin or pick someone else.";

const RISK_APPROVAL_FORBIDDEN_MESSAGES = {
  /** R1, R2: the caller is neither the saved approver nor an Admin. */
  decide: RISK_APPROVAL_FORBIDDEN_MESSAGE,
  /** R3: a non-Admin named themself as the new approver. */
  self: RISK_APPROVAL_SELF_APPROVER_MESSAGE,
} as const;

/**
 * A refused approval change. A ForbiddenException, so a handler that maps
 * those answers 403 with the (translated) message.
 */
export class RiskApprovalForbiddenError extends ForbiddenException {
  constructor(reason: keyof typeof RISK_APPROVAL_FORBIDDEN_MESSAGES = "decide") {
    const message = RISK_APPROVAL_FORBIDDEN_MESSAGES[reason];
    super(message, "risk", "approval", { i18nKey: message });
    this.name = "RiskApprovalForbiddenError";
    Object.setPrototypeOf(this, RiskApprovalForbiddenError.prototype);
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
 * RiskApprovalForbiddenError when the caller may not make the change they
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
  // The saved approver, never the one this save names.
  const callerDecides = callerIsAdmin || (currentApprover !== null && currentApprover === callerId);

  let status: RiskApprovalStatus;
  if (approverChanged) {
    // R3: naming yourself is self-attestation, unless you are an Admin.
    if (nextApprover !== null && nextApprover === callerId && !callerIsAdmin) {
      throw new RiskApprovalForbiddenError("self");
    }
    // R2: a decided risk changes hands only through someone who decides.
    if (isRiskApprovalDecision(currentStatus) && !callerDecides) {
      throw new RiskApprovalForbiddenError();
    }
    if (nextApprover === null) {
      status = RISK_APPROVAL_NOT_REQUIRED;
    } else if (statusChangeRequested && isRiskApprovalDecision(requested!)) {
      // Deciding in the save that names the approver is for an Admin only.
      if (!callerIsAdmin) throw new RiskApprovalForbiddenError();
      status = requested!;
    } else {
      status = RISK_APPROVAL_PENDING;
    }
  } else if (nextApprover !== null) {
    // R1: with a saved approver, any status change needs someone who decides.
    if (statusChangeRequested && !callerDecides) throw new RiskApprovalForbiddenError();
    status = statusChangeRequested ? requested! : currentStatus;
  } else if (
    existing === null ||
    (statusChangeRequested && requested === RISK_APPROVAL_NOT_REQUIRED)
  ) {
    // R4: without an approver a save can only set Not required.
    status = RISK_APPROVAL_NOT_REQUIRED;
  } else {
    // R4: no approver and no change asked for (or one that is ignored): keep
    // the stored status, legacy Approved rows included.
    status = currentStatus;
  }

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
  return roleIsOrganizationAdmin(organizationId, role);
}
