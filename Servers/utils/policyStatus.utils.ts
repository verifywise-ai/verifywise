/**
 * The one place that decides whether a policy's status may be set by hand
 * (create, update, bulk archive, the advisor's create and update tools), and
 * whether its title and content may change on update.
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
 * - No title or content change while an approval request is pending, so the
 *   approvers decide on the text that was submitted. A value equal to the
 *   stored one is not a change. Other fields stay editable.
 *
 * Rejections are ValidationException with field "status", "title" or
 * "content_html" and an English message key the controllers translate.
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
  textPendingRequest:
    "This policy is waiting for approval. Withdraw the request to change its title or content.",
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

export interface PolicyTextChange {
  /** The stored title and content. */
  current: { title?: string | null; content_html?: string | null };
  /** The values that would be written; undefined means "not sent". */
  next: { title?: string | null; content_html?: string | null };
  /** Whether the policy has a Pending approval request. */
  hasPendingRequest: boolean;
}

/** A missing value and an empty one are the same text. */
const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? "") === (b ?? "");

/**
 * The field whose change is refused (title first, then content_html), or null.
 * Pure: the caller supplies the pending flag.
 */
export const getPolicyTextChangeError = ({
  current,
  next,
  hasPendingRequest,
}: PolicyTextChange): "title" | "content_html" | null => {
  if (!hasPendingRequest) return null;
  if (next.title !== undefined && !sameText(next.title, current.title)) return "title";
  if (next.content_html !== undefined && !sameText(next.content_html, current.content_html)) {
    return "content_html";
  }
  return null;
};

/** Throws a 400 ValidationException (field "title" or "content_html") when the text is locked. */
export const assertPolicyTextChange = (change: PolicyTextChange): void => {
  const field = getPolicyTextChangeError(change);
  if (field) {
    throw new ValidationException(POLICY_STATUS_MESSAGES.textPendingRequest, field);
  }
};

interface PolicyStatusRow {
  id: number;
  title: string;
  status: string;
  content_html?: string | null;
  has_pending: boolean;
}

/**
 * The policies' current status and whether each has a Pending approval
 * request. Two statements on purpose: the first locks the rows (a concurrent
 * submit for approval locks the same row, so we wait for it to commit); the
 * second reads approval_requests with a fresh snapshot taken after the lock,
 * so it sees a request that submit has just committed. Reading both in one
 * statement would re-check the locked row at its new version but keep the
 * statement's old snapshot for the request, and miss it.
 */
const lockPolicyStatusRows = async (
  organizationId: number,
  policyIds: number[],
  transaction: Transaction,
  withContent = false,
): Promise<PolicyStatusRow[]> => {
  if (policyIds.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT pm.id, pm.title, pm.status${withContent ? ", pm.content_html" : ""}
     FROM policy_manager pm
     WHERE pm.organization_id = :organizationId AND pm.id IN (:policyIds)
     ORDER BY pm.id
     FOR UPDATE`,
    {
      replacements: { organizationId, policyIds },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<Omit<PolicyStatusRow, "has_pending">>;
  if (rows.length === 0) return [];

  const lockedIds = rows.map((r) => Number(r.id));
  const pendingRows = (await sequelize.query(
    `SELECT DISTINCT ar.entity_id
     FROM approval_requests ar
     WHERE ar.organization_id = :organizationId
       AND ar.entity_type = 'policy'
       AND ar.entity_id IN (:policyIds)
       AND ar.status = :pending`,
    {
      replacements: {
        organizationId,
        policyIds: lockedIds,
        pending: ApprovalRequestStatus.PENDING,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ entity_id: number }>;
  const pending = new Set(pendingRows.map((r) => Number(r.entity_id)));

  return rows.map((r) => ({ ...r, id: Number(r.id), has_pending: pending.has(Number(r.id)) }));
};

/**
 * Checks an update against the stored row and the pending request: the status
 * by the status rules, the title and content by the pending lock. Pass what
 * would be written (undefined = not sent). Locks the row FOR UPDATE, filtered
 * by organization, then reads the pending request, in the caller's save
 * transaction. Returns the stored status (null when the policy is not in the
 * organization, which the caller reports as 404). Does nothing and returns null
 * when no status (undefined or null), title or content was sent.
 */
export const assertPolicyUpdateAllowed = async (params: {
  organizationId: number;
  policyId: number;
  nextStatus: string | null | undefined;
  nextTitle?: string | null;
  nextContentHtml?: string | null;
  transaction: Transaction;
}): Promise<string | null> => {
  const { organizationId, policyId, nextStatus, nextTitle, nextContentHtml, transaction } = params;
  const statusSent = nextStatus !== undefined && nextStatus !== null;
  const textSent = nextTitle !== undefined || nextContentHtml !== undefined;
  if (!statusSent && !textSent) return null;
  const [row] = await lockPolicyStatusRows(organizationId, [policyId], transaction, textSent);
  if (!row) return null;
  assertPolicyStatusChange({
    currentStatus: row.status,
    nextStatus,
    hasPendingRequest: row.has_pending,
  });
  assertPolicyTextChange({
    current: { title: row.title, content_html: row.content_html },
    next: { title: nextTitle, content_html: nextContentHtml },
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
