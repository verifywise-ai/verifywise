/**
 * Policy approval through the generic approval-workflow system.
 *
 * A policy is approved either through an approval request on a *usable*
 * policy workflow (submit, then the workflow's approvers decide; see
 * applyPolicyApprovalDecision for what each decision does to the policy), or,
 * when the organization has no usable policy workflow, directly by an Admin.
 *
 * A workflow is usable for an organization when it belongs to it, has
 * entity_type 'policy', is active, has at least one step, and every step has
 * at least one approver. The seeded "Policy Approval" workflows have a step
 * and no approvers, so they are not usable.
 *
 * Errors (callers map them to HTTP):
 * - NotFoundException   → 404 (policy not in the caller's organization)
 * - ForbiddenException  → 403 (direct approve by a non-Admin)
 * - ValidationException → 400 (field in `metadata.field`: workflow_id, comment)
 * - ConflictException   → 409 (pending request, wrong status, workflow state)
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import { ApprovalRequestStatus } from "../../domain.layer/enums/approval-workflow.enum";
import {
  createApprovalRequestQuery,
  NotificationInfo,
  rejectApprovalRequestOnEntityDelete,
} from "../../utils/approvalRequest.utils";
import { getWorkflowStepsQuery } from "../../utils/approvalWorkflow.utils";
import { getPolicyByIdQuery } from "../../utils/policyManager.utils";
import {
  POLICY_UNDER_REVIEW,
  recordPolicyStatusChange,
} from "../../utils/policyApprovalDecision.utils";
import { roleHasPermission } from "../../utils/rolePermissions.utils";
import { notifyFirstStepApprovers } from "../approvalRequestNotification.service";
import { notifyRequesterRejected } from "../notification.service";
import logger from "../../utils/logger/fileLogger";

/** Statuses from which a policy may be submitted or approved directly. */
const SUBMITTABLE_STATUSES = ["Draft", POLICY_UNDER_REVIEW];
/**
 * Statuses in which a past approval still stands. A policy moved by hand from
 * Approved to another status (e.g. back to Draft) keeps its review columns,
 * but the approval is no longer its current decision, so the state hides it.
 */
const APPROVAL_STANDING_STATUSES = ["Approved", "Published"];

export const POLICY_APPROVAL_COMMENT_MAX = 2000;

export const POLICY_APPROVAL_MESSAGES = {
  notFound: "Policy not found",
  pending: "This policy already has a pending approval request",
  wrongStatus: "Only a draft or under review policy can be submitted or approved",
  noWorkflow:
    "This organization has no policy approval workflow. An Admin can approve the policy directly.",
  chooseWorkflow: "Choose an approval workflow",
  unusableWorkflow: "Choose an approval workflow with an approver on every step",
  useWorkflow: "Use the approval workflow",
  adminOnly: "Only an Admin can approve a policy directly",
  commentTooLong: "Comment must be 2000 characters or fewer",
  commentNotText: "Comment must be text",
  deletedReason: "The policy was deleted.",
} as const;

export interface UsablePolicyWorkflow {
  id: number;
  workflow_title: string;
  step_count: number;
}

export interface PendingPolicyRequest {
  id: number;
  workflow_id: number;
  workflow_title: string | null;
  current_step: number;
  total_steps: number;
  requested_by: number;
  requested_by_name: string | null;
  created_at: Date;
}

export interface PolicyApprovalState {
  usable_workflows: UsablePolicyWorkflow[];
  pending_request: PendingPolicyRequest | null;
  review_status: string | null;
  review_comment: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: Date | null;
  can_submit: boolean;
  can_approve_directly: boolean;
  can_withdraw: boolean;
}

interface LockedPolicy {
  id: number;
  title: string;
  status: string;
  tags: string[] | null;
  next_review_date: Date | string | null;
  policy_owner_id: number | null;
}

/**
 * The organization's usable policy workflows, by title. Approvers are counted
 * with the same organization filter getWorkflowStepsQuery uses, so a usable
 * workflow always yields approvers on the request it creates.
 */
export const getUsablePolicyWorkflows = async (
  organizationId: number,
  transaction?: Transaction,
): Promise<UsablePolicyWorkflow[]> => {
  const rows = (await sequelize.query(
    `SELECT w.id,
            w.workflow_title,
            (SELECT COUNT(*)::int FROM approval_workflow_steps s
              WHERE s.organization_id = w.organization_id AND s.workflow_id = w.id) AS step_count
     FROM approval_workflows w
     WHERE w.organization_id = :organizationId
       AND w.entity_type = 'policy'
       AND w.is_active = true
       AND EXISTS (
         SELECT 1 FROM approval_workflow_steps s
         WHERE s.organization_id = w.organization_id AND s.workflow_id = w.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM approval_workflow_steps s
         WHERE s.organization_id = w.organization_id
           AND s.workflow_id = w.id
           AND NOT EXISTS (
             SELECT 1 FROM approval_step_approvers a
             WHERE a.organization_id = w.organization_id AND a.workflow_step_id = s.id
           )
       )
     ORDER BY w.workflow_title ASC, w.id ASC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as UsablePolicyWorkflow[];
  return rows.map((r) => ({
    id: Number(r.id),
    workflow_title: r.workflow_title,
    step_count: Number(r.step_count),
  }));
};

/** The policy's pending approval request, or null. */
export const getPendingPolicyRequest = async (
  organizationId: number,
  policyId: number,
  transaction?: Transaction,
): Promise<PendingPolicyRequest | null> => {
  const rows = (await sequelize.query(
    `SELECT ar.id,
            ar.workflow_id,
            w.workflow_title,
            ar.current_step,
            (SELECT COUNT(*)::int FROM approval_request_steps ars
              WHERE ars.organization_id = ar.organization_id AND ars.request_id = ar.id) AS total_steps,
            ar.requested_by,
            NULLIF(TRIM(CONCAT(u.name, ' ', u.surname)), '') AS requested_by_name,
            ar.created_at
     FROM approval_requests ar
     LEFT JOIN approval_workflows w
       ON w.id = ar.workflow_id AND w.organization_id = ar.organization_id
     LEFT JOIN users u ON u.id = ar.requested_by
     WHERE ar.organization_id = :organizationId
       AND ar.entity_type = 'policy'
       AND ar.entity_id = :policyId
       AND ar.status = :pending
     ORDER BY ar.created_at DESC
     LIMIT 1`,
    {
      replacements: { organizationId, policyId, pending: ApprovalRequestStatus.PENDING },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as PendingPolicyRequest[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    workflow_id: Number(row.workflow_id),
    current_step: Number(row.current_step),
    total_steps: Number(row.total_steps),
    requested_by: Number(row.requested_by),
  };
};

/** Locks the policy row for the rest of the transaction; undefined when there is none. */
const lockPolicyRow = async (
  organizationId: number,
  policyId: number,
  transaction: Transaction,
): Promise<LockedPolicy | undefined> => {
  const rows = (await sequelize.query(
    `SELECT id, title, status, tags, next_review_date, policy_owner_id
     FROM policy_manager
     WHERE organization_id = :organizationId AND id = :policyId
     FOR UPDATE`,
    {
      replacements: { organizationId, policyId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as LockedPolicy[];
  return rows[0];
};

/** Locks the policy row for the rest of the transaction, or throws 404. */
const lockPolicy = async (
  organizationId: number,
  policyId: number,
  transaction: Transaction,
): Promise<LockedPolicy> => {
  const policy = await lockPolicyRow(organizationId, policyId, transaction);
  if (!policy) {
    throw new NotFoundException(POLICY_APPROVAL_MESSAGES.notFound, "policy", policyId);
  }
  return policy;
};

/** 409 when a request is pending or the status cannot be sent for approval. */
const assertSubmittable = async (
  organizationId: number,
  policy: LockedPolicy,
  transaction: Transaction,
): Promise<void> => {
  if (await getPendingPolicyRequest(organizationId, policy.id, transaction)) {
    throw new ConflictException(POLICY_APPROVAL_MESSAGES.pending, "policy", "status");
  }
  if (!SUBMITTABLE_STATUSES.includes(policy.status)) {
    throw new ConflictException(POLICY_APPROVAL_MESSAGES.wrongStatus, "policy", "status");
  }
};

/** Picks the workflow for a submission (S3 rules). */
const chooseWorkflow = (
  usable: UsablePolicyWorkflow[],
  workflowId: number | undefined,
): UsablePolicyWorkflow => {
  if (workflowId !== undefined && workflowId !== null) {
    const chosen = usable.find((w) => w.id === Number(workflowId));
    if (!chosen) {
      throw new ValidationException(
        POLICY_APPROVAL_MESSAGES.unusableWorkflow,
        "workflow_id",
        workflowId,
      );
    }
    return chosen;
  }
  if (usable.length === 0) {
    throw new ConflictException(POLICY_APPROVAL_MESSAGES.noWorkflow, "approval_workflow");
  }
  if (usable.length > 1) {
    throw new ValidationException(POLICY_APPROVAL_MESSAGES.chooseWorkflow, "workflow_id");
  }
  return usable[0];
};

const rollbackQuietly = async (transaction: Transaction): Promise<void> => {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    logger.error(`policy approval: rollback failed: ${rollbackError}`);
  }
};

/**
 * Opens an approval request for the policy and puts it under review.
 * The request, the policy update and the history row commit together; the
 * step 1 approvers (except the requester) are notified after the commit.
 */
export const submitPolicyForApproval = async (params: {
  orgId: number;
  policyId: number;
  userId: number;
  workflowId?: number;
}): Promise<{ request_id: number; policy: any }> => {
  const { orgId, policyId, userId, workflowId } = params;
  const transaction = await sequelize.transaction();
  let requestId: number;
  let workflow: UsablePolicyWorkflow;
  let workflowSteps: any[];
  let policyTitle: string;

  try {
    const policy = await lockPolicy(orgId, policyId, transaction);
    await assertSubmittable(orgId, policy, transaction);

    const usable = await getUsablePolicyWorkflows(orgId, transaction);
    workflow = chooseWorkflow(usable, workflowId);
    workflowSteps = await getWorkflowStepsQuery(workflow.id, orgId, transaction);
    policyTitle = policy.title;

    const request = await createApprovalRequestQuery(
      {
        request_name: policy.title,
        workflow_id: workflow.id,
        entity_id: policy.id,
        entity_type: "policy",
        entity_data: {
          title: policy.title,
          status: policy.status,
          tags: policy.tags,
          next_review_date: policy.next_review_date,
          policy_owner_id: policy.policy_owner_id,
        },
        status: ApprovalRequestStatus.PENDING,
        requested_by: userId,
      },
      workflowSteps,
      orgId,
      transaction,
    );
    requestId = Number((request as any).id);

    await sequelize.query(
      `UPDATE policy_manager
       SET status = :underReview,
           review_status = 'pending_review',
           review_comment = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL,
           last_updated_by = :userId,
           last_updated_at = NOW()
       WHERE organization_id = :organizationId AND id = :policyId`,
      {
        replacements: {
          organizationId: orgId,
          policyId,
          userId,
          underReview: POLICY_UNDER_REVIEW,
        },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
    await recordPolicyStatusChange(
      orgId,
      policyId,
      userId,
      policy.status,
      POLICY_UNDER_REVIEW,
      transaction,
    );

    await transaction.commit();
  } catch (error) {
    await rollbackQuietly(transaction);
    throw error;
  }

  void notifyFirstStepApprovers({
    organizationId: orgId,
    requestId,
    requestName: policyTitle,
    requesterId: userId,
    workflow: { workflow_title: workflow.workflow_title },
    workflowSteps,
    baseUrl: process.env.FRONTEND_URL || "http://localhost:3000",
    entity: { type: "policy", id: policyId },
  }).catch((notifyError) =>
    logger.error(
      `policy approval: failed to notify approvers of request ${requestId}: ${notifyError}`,
    ),
  );

  const updated = await getPolicyByIdQuery(orgId, policyId);
  return { request_id: requestId, policy: updated?.[0] ?? null };
};

/** 403 unless the role holds organization.admin; only an Admin approves a policy directly. */
const assertDirectApprover = async (orgId: number, role: string | undefined): Promise<void> => {
  const isAdmin = !!role && (await roleHasPermission(orgId, role, "organization.admin"));
  if (!isAdmin) {
    throw new ForbiddenException(POLICY_APPROVAL_MESSAGES.adminOnly, "policy", "approve");
  }
};

/**
 * Read-only check that a direct approval could go ahead, for a caller that
 * queues the approval behind someone else's sign-off (the advisor). Refuses a
 * non-Admin (403) and an organization with a usable workflow (409) before
 * anyone signs off, since the approval would refuse both afterwards.
 * approvePolicyDirectly checks both again, the workflow under the row lock.
 */
export const assertPolicyDirectApprovalPossible = async (
  orgId: number,
  role: string | undefined,
): Promise<void> => {
  await assertDirectApprover(orgId, role);
  if ((await getUsablePolicyWorkflows(orgId)).length > 0) {
    throw new ConflictException(POLICY_APPROVAL_MESSAGES.useWorkflow, "approval_workflow");
  }
};

/**
 * An Admin approves the policy without a workflow. Allowed only when the
 * organization has no usable policy workflow and no request is pending.
 */
export const approvePolicyDirectly = async (params: {
  orgId: number;
  policyId: number;
  userId: number;
  role: string | undefined;
  comment?: string | null;
}): Promise<any> => {
  const { orgId, policyId, userId, role } = params;

  await assertDirectApprover(orgId, role);
  if (params.comment !== undefined && params.comment !== null) {
    if (typeof params.comment !== "string") {
      throw new ValidationException(POLICY_APPROVAL_MESSAGES.commentNotText, "comment");
    }
    if (params.comment.length > POLICY_APPROVAL_COMMENT_MAX) {
      throw new ValidationException(POLICY_APPROVAL_MESSAGES.commentTooLong, "comment");
    }
  }
  const comment = params.comment?.trim() ? params.comment.trim() : null;

  const transaction = await sequelize.transaction();
  try {
    const policy = await lockPolicy(orgId, policyId, transaction);
    const usable = await getUsablePolicyWorkflows(orgId, transaction);
    if (usable.length > 0) {
      throw new ConflictException(POLICY_APPROVAL_MESSAGES.useWorkflow, "approval_workflow");
    }
    await assertSubmittable(orgId, policy, transaction);

    await sequelize.query(
      `UPDATE policy_manager
       SET status = 'Approved',
           review_status = 'approved',
           reviewed_by = :userId,
           reviewed_at = NOW(),
           review_comment = :comment,
           last_updated_by = :userId,
           last_updated_at = NOW()
       WHERE organization_id = :organizationId AND id = :policyId`,
      {
        replacements: { organizationId: orgId, policyId, userId, comment },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
    await recordPolicyStatusChange(orgId, policyId, userId, policy.status, "Approved", transaction);

    await transaction.commit();
  } catch (error) {
    await rollbackQuietly(transaction);
    throw error;
  }

  const updated = await getPolicyByIdQuery(orgId, policyId);
  return updated?.[0] ?? null;
};

/** What the editor's approval section shows, and which actions the caller has. */
export const getPolicyApprovalState = async (params: {
  orgId: number;
  policyId: number;
  userId: number;
  role: string | undefined;
}): Promise<PolicyApprovalState> => {
  const { orgId, policyId, userId, role } = params;

  const rows = (await sequelize.query(
    `SELECT pm.status,
            pm.review_status,
            pm.review_comment,
            pm.reviewed_by,
            pm.reviewed_at,
            NULLIF(TRIM(CONCAT(u.name, ' ', u.surname)), '') AS reviewed_by_name
     FROM policy_manager pm
     LEFT JOIN users u ON u.id = pm.reviewed_by
     WHERE pm.organization_id = :organizationId AND pm.id = :policyId`,
    {
      replacements: { organizationId: orgId, policyId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{
    status: string;
    review_status: string | null;
    review_comment: string | null;
    reviewed_by: number | null;
    reviewed_at: Date | null;
    reviewed_by_name: string | null;
  }>;
  const policy = rows[0];
  if (!policy) {
    throw new NotFoundException(POLICY_APPROVAL_MESSAGES.notFound, "policy", policyId);
  }

  const [usable, pending, canEdit, isAdmin] = await Promise.all([
    getUsablePolicyWorkflows(orgId),
    getPendingPolicyRequest(orgId, policyId),
    role ? roleHasPermission(orgId, role, "policy.edit") : Promise.resolve(false),
    role ? roleHasPermission(orgId, role, "organization.admin") : Promise.resolve(false),
  ]);

  const submittable = SUBMITTABLE_STATUSES.includes(policy.status) && !pending;
  // A rejection ("changes requested") keeps showing on the Draft it produced;
  // an approval shows only while the policy is still Approved or Published.
  const decisionStands =
    policy.review_status !== "approved" || APPROVAL_STANDING_STATUSES.includes(policy.status);

  return {
    usable_workflows: usable,
    pending_request: pending,
    review_status: decisionStands ? (policy.review_status ?? null) : null,
    review_comment: decisionStands ? (policy.review_comment ?? null) : null,
    reviewed_by:
      decisionStands && policy.reviewed_by !== null && policy.reviewed_by !== undefined
        ? Number(policy.reviewed_by)
        : null,
    reviewed_by_name: decisionStands ? (policy.reviewed_by_name ?? null) : null,
    reviewed_at: decisionStands ? (policy.reviewed_at ?? null) : null,
    can_submit: canEdit && usable.length > 0 && submittable,
    can_approve_directly: isAdmin && usable.length === 0 && submittable,
    can_withdraw: !!pending && pending.requested_by === userId,
  };
};

/**
 * Rejects the policy's pending approval request inside the policy delete's
 * transaction, and notifies the requester once that transaction commits.
 * Returns the notification info, or null when nothing was pending (or the
 * policy does not exist; the delete then reports 404).
 *
 * The policy row is locked first, as submit locks it before opening a
 * request: a submit racing the delete either commits before this read (and
 * its request is rejected here) or waits for the delete and finds no policy.
 */
export const rejectPendingPolicyRequestOnDelete = async (
  orgId: number,
  policyId: number,
  transaction: Transaction,
): Promise<NotificationInfo | null> => {
  if (!(await lockPolicyRow(orgId, policyId, transaction))) return null;
  const pending = await getPendingPolicyRequest(orgId, policyId, transaction);
  if (!pending) return null;

  const info = await rejectApprovalRequestOnEntityDelete(
    pending.id,
    orgId,
    POLICY_APPROVAL_MESSAGES.deletedReason,
    transaction,
  );
  if (info?.requesterId) {
    const requesterId = info.requesterId;
    transaction.afterCommit(() => {
      notifyRequesterRejected(orgId, requesterId, info.requestId, info.requestName, {
        rejector_name: "System",
        rejection_reason: POLICY_APPROVAL_MESSAGES.deletedReason,
      }).catch((notifyError) =>
        logger.error(
          `policy approval: failed to notify requester of rejected request ${info.requestId}: ${notifyError}`,
        ),
      );
    });
  }
  return info;
};
