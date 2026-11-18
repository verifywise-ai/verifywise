/**
 * Who may decide a model's approval (audit decision 9). The same rule risks
 * got in #5418 (`riskApproval.utils.ts`), applied to the model's `approver`
 * and `status`. "Decides" means the caller is an Admin or the model's SAVED
 * approver, never the approver the same save names.
 *
 * Decisions are the statuses an approver hands down: Approved, Restricted
 * (approved with limits), Blocked and Rejected. Pending (awaiting review) and
 * Retired (decommissioned, a lifecycle step) are not decisions.
 *
 * - R1: while the model has a saved approver, moving its status to or from a
 *   decision needs a caller who decides. Sending the stored value back is not
 *   a change. Moving between Pending and Retired is free.
 * - R2: changing the approver (to someone else or to nobody) of a model that
 *   has a saved approver needs a caller who decides, whatever the status.
 *   Without this, an editor could clear the approver of a Pending model and
 *   decide it in a second save. A legacy decided model with no approver
 *   needs the same, so there only an Admin names one.
 * - R3: a non-Admin may not name themself as the new approver. Keeping
 *   yourself when you already are the saved approver is fine.
 * - In a save that names a new approver, only an Admin may also move the
 *   status to or from a decision; the new approver decides in a later save.
 *
 * Without a saved approver and without naming one, any editor may set any
 * status, as before. Unlike risks, the rule never rewrites the status: a
 * refused change is a 403, an allowed one is stored as sent.
 */

import {
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { ModelInventoryStatus } from "../domain.layer/enums/model-inventory-status.enum";
import { RISK_APPROVAL_SELF_APPROVER_MESSAGE } from "./riskApproval.utils";
import { toPositiveId } from "./modelReferences.utils";

export const MODEL_APPROVAL_FORBIDDEN_MESSAGE =
  "Only the model's approver or an Admin can change its approval.";

/** The model statuses that are an approver's decision. */
export const MODEL_DECISION_STATUSES: readonly ModelInventoryStatus[] = [
  ModelInventoryStatus.APPROVED,
  ModelInventoryStatus.RESTRICTED,
  ModelInventoryStatus.BLOCKED,
  ModelInventoryStatus.REJECTED,
];

export function isModelStatusDecision(status: string | null | undefined): boolean {
  return MODEL_DECISION_STATUSES.includes(status as ModelInventoryStatus);
}

const MODEL_STATUSES = Object.values(ModelInventoryStatus) as string[];

const isModelStatus = (value: unknown): value is ModelInventoryStatus =>
  typeof value === "string" && MODEL_STATUSES.includes(value);

export const MODEL_STATUS_INVALID = "Status must be one of the model statuses.";
export const MODEL_APPROVER_INVALID = "The approver must be a member of this organization.";

/**
 * Refuses (ValidationException, 400) a status or approver of the wrong
 * shape before the approval rule reads them, on every route: an array, an
 * object or a number must never pass as "not sent" and skip the rule.
 *
 * - `status`: absent, or one of the model statuses. On create, "" and null
 *   still mean "not sent" (Pending), as the legacy route always accepted.
 * - `approver`: absent, null, "" (none), an integer or a string of digits.
 *
 * Returns the input with a create's empty status removed.
 */
export function assertModelApprovalInput<T extends { status?: unknown; approver?: unknown }>(
  input: T,
  { creating }: { creating: boolean },
): T {
  let checked = input;
  if (creating && (input.status === "" || input.status === null)) {
    const { status: _empty, ...rest } = input;
    checked = rest as T;
  }
  if (checked.status !== undefined && !isModelStatus(checked.status)) {
    throw new ValidationException(MODEL_STATUS_INVALID, "status", checked.status);
  }
  const approver = checked.approver;
  const approverOk =
    approver === undefined ||
    approver === null ||
    approver === "" ||
    (typeof approver === "number" && Number.isInteger(approver)) ||
    (typeof approver === "string" && /^[0-9]+$/.test(approver));
  if (!approverOk) {
    throw new ValidationException(MODEL_APPROVER_INVALID, "approver", approver);
  }
  return checked;
}

const MODEL_APPROVAL_FORBIDDEN_MESSAGES = {
  /** R1, R2 and the naming save: the caller does not decide. */
  decide: MODEL_APPROVAL_FORBIDDEN_MESSAGE,
  /** R3: a non-Admin named themself as the new approver (same words as risks). */
  self: RISK_APPROVAL_SELF_APPROVER_MESSAGE,
} as const;

/** A refused approval change; a ForbiddenException, answered 403 with its message. */
export class ModelApprovalForbiddenError extends ForbiddenException {
  constructor(reason: keyof typeof MODEL_APPROVAL_FORBIDDEN_MESSAGES = "decide") {
    const message = MODEL_APPROVAL_FORBIDDEN_MESSAGES[reason];
    super(message, "model", "approval", { i18nKey: message });
    this.name = "ModelApprovalForbiddenError";
    Object.setPrototypeOf(this, ModelApprovalForbiddenError.prototype);
  }
}

export interface ModelApprovalArgs {
  /** The stored model (read under a row lock on update), or null on create. */
  existing: { approver: number | null; status: string | null } | null;
  /** What the caller sent. An absent key means "not supplied". */
  submitted: { approver?: unknown; status?: unknown };
  callerId: number;
  callerIsAdmin: boolean;
}

/** null for none ("", 0, null), else the id (validation has already run). */
function toApproverId(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === 0) return null;
  return toPositiveId(value);
}

/**
 * Throws ModelApprovalForbiddenError when the caller may not make the
 * approval change they asked for. Returns nothing: the values are stored as
 * sent.
 */
export function assertModelApprovalAllowed({
  existing,
  submitted,
  callerId,
  callerIsAdmin,
}: ModelApprovalArgs): void {
  const savedApprover = toApproverId(existing?.approver);
  const savedStatus = existing?.status ?? null;

  const nextApprover =
    submitted.approver !== undefined ? toApproverId(submitted.approver) : savedApprover;
  const approverChanged = nextApprover !== savedApprover;

  // Fail closed: a status that was sent but is not a model status counts as
  // a change touching a decision (assertModelApprovalInput refuses it first).
  const statusSent = submitted.status !== undefined;
  const statusValid = isModelStatus(submitted.status);
  const statusChanged = statusSent && (!statusValid || submitted.status !== savedStatus);
  const touchesDecision =
    statusChanged &&
    (!statusValid ||
      isModelStatusDecision(submitted.status as string) ||
      isModelStatusDecision(savedStatus));

  // The saved approver, never the one this save names.
  const callerDecides = callerIsAdmin || (savedApprover !== null && savedApprover === callerId);

  if (approverChanged) {
    // R3: naming yourself is self-attestation, unless you are an Admin.
    if (nextApprover !== null && nextApprover === callerId && !callerIsAdmin) {
      throw new ModelApprovalForbiddenError("self");
    }
    // R2: a model with a saved approver changes hands only through someone
    // who decides, whatever its status. Otherwise clearing the approver of a
    // Pending model would leave a model no rule protects, decided in the next
    // save. A decided model with no approver (legacy) needs the same.
    if ((savedApprover !== null || isModelStatusDecision(savedStatus)) && !callerDecides) {
      throw new ModelApprovalForbiddenError();
    }
    // Deciding in the save that names the approver is for an Admin only.
    if (nextApprover !== null && touchesDecision && !callerIsAdmin) {
      throw new ModelApprovalForbiddenError();
    }
  }

  // R1: with a saved approver, a move to or from a decision needs someone who decides.
  if (savedApprover !== null && touchesDecision && !callerDecides) {
    throw new ModelApprovalForbiddenError();
  }
}
