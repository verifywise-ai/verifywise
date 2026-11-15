/**
 * The one place that decides whether a policy's status may be set by hand
 * (create, update, bulk archive, the advisor's create and update tools).
 *
 * - Under Review is set only by submitting for approval, Approved only by the
 *   approval workflow or an Admin's direct approval: never by hand.
 * - Published only from Approved.
 * - Draft, Archived and Deprecated by hand, subject to the transition table
 *   (POLICY_INVALID_STATUS_TRANSITIONS).
 * - No status change while an approval request is pending.
 * - A status equal to the current one is not a change and is always accepted
 *   (the editor sends the status on every save).
 * - A new policy may be Draft (the default), Archived or Deprecated.
 *
 * Rejections are ValidationException with field "status" and an English
 * message key the controllers translate.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { ApprovalRequestStatus } from "../domain.layer/enums/approval-workflow.enum";
import { findInvalidPolicyStatusTransition } from "./validations/policiesValidation.utils";

/** Status a policy gets when none is sent on create. */
export const POLICY_DEFAULT_STATUS = "Draft";

/** Statuses a policy may be created with. */
export const POLICY_CREATE_STATUSES: readonly string[] = ["Draft", "Archived", "Deprecated"];

export const POLICY_STATUS_MESSAGES = {
  pendingRequest: "Withdraw the approval request before changing the status",
  underReviewByHand: "Submit the policy for approval to put it under review",
  approvedByHand: "A policy is approved through its approval workflow or by an Admin",
  publishNotApproved: "Only an approved policy can be published",
  createStatus: "A new policy can be draft, archived or deprecated",
  bulkArchivePending: "Withdraw the approval request before archiving these policies: {policies}",
} as const;

export interface PolicyStatusChange {
  /** The stored status, or null when the policy is being created. */
  currentStatus: string | null;
  /** The status sent; undefined means "not sent". */
  nextStatus: string | null | undefined;
  /** Whether the policy has a Pending approval request. */
  hasPendingRequest?: boolean;
}

/**
 * Why the status change is not allowed, as an English message key, or null
 * when it is allowed. Pure: the caller supplies the pending flag.
 */
export const getPolicyStatusChangeError = ({
  currentStatus,
  nextStatus,
  hasPendingRequest = false,
}: PolicyStatusChange): string | null => {
  if (currentStatus === null) {
    const status = nextStatus ?? POLICY_DEFAULT_STATUS;
    return POLICY_CREATE_STATUSES.includes(status) ? null : POLICY_STATUS_MESSAGES.createStatus;
  }
  if (nextStatus === undefined || nextStatus === null || nextStatus === currentStatus) {
    return null;
  }
  if (hasPendingRequest) return POLICY_STATUS_MESSAGES.pendingRequest;
  if (nextStatus === "Under Review") return POLICY_STATUS_MESSAGES.underReviewByHand;
  if (nextStatus === "Approved") return POLICY_STATUS_MESSAGES.approvedByHand;
  if (nextStatus === "Published" && currentStatus !== "Approved") {
    return POLICY_STATUS_MESSAGES.publishNotApproved;
  }
  return findInvalidPolicyStatusTransition(currentStatus, nextStatus)?.message ?? null;
};

/** Throws a 400 ValidationException (field "status") when the change is not allowed. */
export const assertPolicyStatusChange = (change: PolicyStatusChange): void => {
  const message = getPolicyStatusChangeError(change);
  if (message) throw new ValidationException(message, "status", change.nextStatus);
};

interface PolicyStatusRow {
  id: number;
  title: string;
  status: string;
  has_pending: boolean;
}

/**
 * The policies' current status and whether each has a Pending approval
 * request. Locks the rows for the transaction, so a concurrent submit for
 * approval (which locks the same row) cannot slip in between check and write.
 */
const lockPolicyStatusRows = async (
  organizationId: number,
  policyIds: number[],
  transaction: Transaction,
): Promise<PolicyStatusRow[]> => {
  if (policyIds.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT pm.id, pm.title, pm.status,
            EXISTS (
              SELECT 1 FROM approval_requests ar
              WHERE ar.organization_id = pm.organization_id
                AND ar.entity_type = 'policy'
                AND ar.entity_id = pm.id
                AND ar.status = :pending
            ) AS has_pending
     FROM policy_manager pm
     WHERE pm.organization_id = :organizationId AND pm.id IN (:policyIds)
     ORDER BY pm.id
     FOR UPDATE OF pm`,
    {
      replacements: { organizationId, policyIds, pending: ApprovalRequestStatus.PENDING },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as PolicyStatusRow[];
  return rows.map((r) => ({ ...r, id: Number(r.id), has_pending: !!r.has_pending }));
};

/**
 * Checks a status sent on update against the stored status and the pending
 * request. Returns the stored status (null when the policy is not in the
 * organization, which the caller reports as 404). Does nothing when no status
 * was sent.
 */
export const assertPolicyStatusUpdateAllowed = async (params: {
  organizationId: number;
  policyId: number;
  nextStatus: string | null | undefined;
  transaction: Transaction;
}): Promise<string | null> => {
  const { organizationId, policyId, nextStatus, transaction } = params;
  if (nextStatus === undefined) return null;
  const [row] = await lockPolicyStatusRows(organizationId, [policyId], transaction);
  if (!row) return null;
  assertPolicyStatusChange({
    currentStatus: row.status,
    nextStatus,
    hasPendingRequest: row.has_pending,
  });
  return row.status;
};

/**
 * Checks that every policy may be archived. A policy with a pending approval
 * request blocks the whole batch: one 400 names the blocked policies and
 * nothing changes.
 */
export const assertPoliciesCanBeArchived = async (
  organizationId: number,
  policyIds: number[],
  transaction: Transaction,
): Promise<void> => {
  const rows = await lockPolicyStatusRows(organizationId, policyIds, transaction);
  const blocked = rows
    .map((row) => ({
      row,
      error: getPolicyStatusChangeError({
        currentStatus: row.status,
        nextStatus: "Archived",
        hasPendingRequest: row.has_pending,
      }),
    }))
    .filter((b) => b.error !== null);
  if (blocked.length === 0) return;

  const pendingOnly = blocked.every((b) => b.error === POLICY_STATUS_MESSAGES.pendingRequest);
  if (!pendingOnly) {
    // Not reachable with today's rules (nothing forbids a move to Archived
    // except a pending request); kept so a new rule cannot be skipped.
    throw new ValidationException(blocked[0].error!, "status", blocked[0].row.id);
  }
  const policies = blocked.map((b) => `"${b.row.title}"`).join(", ");
  throw new ValidationException(
    POLICY_STATUS_MESSAGES.bulkArchivePending.replace("{policies}", policies),
    "status",
    blocked.map((b) => b.row.id),
    {
      i18nKey: POLICY_STATUS_MESSAGES.bulkArchivePending,
      i18nVars: { policies },
    },
  );
};
