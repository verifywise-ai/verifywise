/**
 * Policy side of an approval-workflow decision.
 *
 * A policy waits in "Under Review" while its approval request is pending.
 * When the request is decided or withdrawn, the policy moves on inside the
 * caller's transaction (processApprovalQuery / withdrawApprovalRequestQuery):
 *
 * - approved (final step): Approved, review_status 'approved'
 * - rejected (any step): back to Draft, review_status 'changes_requested'
 * - withdrawn: back to Draft, review_status cleared
 *
 * Each UPDATE matches the organization and status 'Under Review'. When no row
 * matches (the policy was edited or deleted meanwhile) it logs a warning and
 * returns false: the policy must never block the decision itself.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { recordMultipleFieldChanges, trackEntityChanges } from "./changeHistory.base.utils";
import logger from "./logger/fileLogger";

export type PolicyApprovalDecision = "approved" | "rejected" | "withdrawn";

export const POLICY_UNDER_REVIEW = "Under Review";

/**
 * Records a policy status change in the policy change history, labelled and
 * formatted the same way a status edit in the editor is.
 */
export const recordPolicyStatusChange = async (
  organizationId: number,
  policyId: number,
  actorId: number | null,
  oldStatus: string | null | undefined,
  newStatus: string,
  transaction: Transaction,
): Promise<void> => {
  const changes = await trackEntityChanges(
    "policy",
    { status: oldStatus ?? null },
    { status: newStatus },
  );
  if (changes.length > 0) {
    await recordMultipleFieldChanges(
      "policy",
      policyId,
      actorId,
      organizationId,
      changes,
      transaction,
    );
  }
};

const DECISION_SQL: Record<PolicyApprovalDecision, { status: string; set: string }> = {
  approved: {
    status: "Approved",
    set: `status = 'Approved',
          review_status = 'approved',
          review_comment = :comment,
          reviewed_by = :actorId,
          reviewed_at = NOW()`,
  },
  rejected: {
    status: "Draft",
    set: `status = 'Draft',
          review_status = 'changes_requested',
          review_comment = :comment,
          reviewed_by = :actorId,
          reviewed_at = NOW()`,
  },
  withdrawn: {
    status: "Draft",
    set: `status = 'Draft',
          review_status = NULL`,
  },
};

/**
 * Moves a policy on after its approval request was decided or withdrawn.
 * Returns true when the policy was updated.
 */
export const applyPolicyApprovalDecision = async (params: {
  organizationId: number;
  policyId: number;
  decision: PolicyApprovalDecision;
  /** The decider, or the withdrawer; null when the system acted. */
  actorId: number | null;
  comment?: string | null;
  transaction: Transaction;
}): Promise<boolean> => {
  const { organizationId, policyId, decision, actorId, transaction } = params;
  const { status, set } = DECISION_SQL[decision];
  const comment = params.comment?.trim() ? params.comment.trim() : null;

  const rows = (await sequelize.query(
    `UPDATE policy_manager
     SET ${set}
     WHERE organization_id = :organizationId
       AND id = :policyId
       AND status = :underReview
     RETURNING id`,
    {
      replacements: {
        organizationId,
        policyId,
        actorId,
        comment,
        underReview: POLICY_UNDER_REVIEW,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { id: number }[];

  if (rows.length === 0) {
    logger.warn(
      `policy approval ${decision}: policy ${policyId} in organization ${organizationId} is not under review; left unchanged`,
    );
    return false;
  }

  await recordPolicyStatusChange(
    organizationId,
    policyId,
    actorId,
    POLICY_UNDER_REVIEW,
    status,
    transaction,
  );
  return true;
};
