import { Transaction } from "sequelize";
import { deleteProjectByIdQuery, lockProjectForDelete } from "./project.utils";
import {
  getPendingApprovalRequestIdQuery,
  withdrawApprovalRequestQuery,
} from "./approvalRequest.utils";
import { recordUseCaseDeletion } from "./useCaseChangeHistory.utils";

export interface DeleteProjectOptions {
  /** The user recorded in the change history; no history row without one. */
  userId?: number | null;
  /** The caller already holds the project row FOR UPDATE in this transaction. */
  alreadyLocked?: boolean;
  /** Withdraw a pending use-case approval request first (default true). */
  withdrawApproval?: boolean;
  /** Record the deletion in the use-case change history (default true). */
  recordHistory?: boolean;
  /** Queue the project_deleted automation only after the transaction commits. */
  enqueueAutomationAfterCommit?: boolean;
}

/**
 * The one way to delete a project, in one fixed order so the callers cannot
 * drift apart:
 *
 * 1. lock the project row (lockProjectForDelete), unless the caller already
 *    holds it — before anything that references the project; if there is no
 *    such project in the organization, stop here (deleted: false) and touch
 *    nothing else;
 * 2. withdraw a pending use-case approval request;
 * 3. record the deletion in the change history (the table has no FK to
 *    projects, so recording first is safe; if the delete then fails the
 *    caller rolls back);
 * 4. deleteProjectByIdQuery: children, the project row, the project_deleted
 *    automation (after commit when asked). It locks the project as its own
 *    first statement too, a no-op here.
 *
 * Used by the core "Delete use case", Jira Assets and the demo-data driver.
 * Returns what deleteProjectByIdQuery returned (false when there was no such
 * project) and the approval request it withdrew, if any.
 */
export async function deleteProjectWithSideEffects(
  projectId: number,
  organizationId: number,
  transaction: Transaction,
  options: DeleteProjectOptions = {},
): Promise<{ deleted: boolean; withdrawnApprovalId: number | null }> {
  const {
    userId = null,
    alreadyLocked = false,
    withdrawApproval = true,
    recordHistory = true,
    enqueueAutomationAfterCommit = false,
  } = options;

  if (!alreadyLocked && !(await lockProjectForDelete(projectId, organizationId, transaction))) {
    // No such project in this organization: touch nothing else.
    return { deleted: false, withdrawnApprovalId: null };
  }

  let withdrawnApprovalId: number | null = null;
  if (withdrawApproval) {
    withdrawnApprovalId = await getPendingApprovalRequestIdQuery(
      projectId,
      "use_case",
      organizationId,
      transaction,
    );
    if (withdrawnApprovalId) {
      await withdrawApprovalRequestQuery(withdrawnApprovalId, organizationId, transaction);
    }
  }

  if (recordHistory && userId) {
    await recordUseCaseDeletion(projectId, userId, organizationId, transaction);
  }

  // deleteProjectByIdQuery takes the lock again as its first statement; the
  // row is already locked by this transaction, so that is one cheap no-op.
  const deleted = await deleteProjectByIdQuery(projectId, organizationId, transaction, {
    enqueueAutomationAfterCommit,
  });
  return { deleted, withdrawnApprovalId };
}
