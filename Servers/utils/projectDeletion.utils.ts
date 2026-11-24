import { Transaction } from "sequelize";
import { deleteProjectByIdQuery, lockProjectForDelete } from "./project.utils";
import {
  getPendingApprovalRequestIdQuery,
  withdrawApprovalRequestQuery,
} from "./approvalRequest.utils";
import { recordUseCaseDeletion } from "./useCaseChangeHistory.utils";
import {
  archiveRisksInBulkQuery,
  getRisksLinkedOnlyToProjectQuery,
  lockRiskLinksOfProjectQuery,
} from "./risk.utils";

export interface DeleteProjectOptions {
  /** The user recorded in the change history; no history row without one. */
  userId?: number | null;
  /** The caller already holds the project row FOR UPDATE in this transaction. */
  alreadyLocked?: boolean;
  /** Withdraw a pending use-case approval request first (default true). */
  withdrawApproval?: boolean;
  /** Record the deletion in the use-case change history (default true). */
  recordHistory?: boolean;
  /**
   * Archive the active risks linked to this use case and to no other before
   * the links go (default false). An archived risk with no use case link is
   * visible only to Admins, its owner and its approver, while an active one
   * is visible to everyone, so this keeps them private. The set is read in
   * this transaction after the project lock and after locking every link of
   * every risk linked here (lockRiskLinksOfProjectQuery), so a concurrent
   * unlink cannot change it before the commit. The archive is the bulk
   * archive (history entries, policy unlinks, one automation), recorded as
   * userId.
   */
  archiveRisksLinkedOnlyHere?: boolean;
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
 * 4. when asked, lock the risks linked to this use case and all their links,
 *    then archive the risks linked only to this use case
 *    (archiveRisksLinkedOnlyHere), while its projects_risks rows still exist;
 * 5. deleteProjectByIdQuery: children, the project row, the project_deleted
 *    automation (after commit). It locks the project as its own
 *    first statement too, a no-op here.
 *
 * Callers: the core "Delete use case" (legacy route never archives, v1 route
 * archives when the user chose to), the advisor's agent_delete_use_case and
 * the Jira Assets removals (both always archive), and the demo-data driver
 * (no archive: it deletes the demo risks first). Returns what deleteProjectByIdQuery returned
 * (false when there was no such project), the approval request it withdrew,
 * if any, and the ids of the risks it archived.
 */
export async function deleteProjectWithSideEffects(
  projectId: number,
  organizationId: number,
  transaction: Transaction,
  options: DeleteProjectOptions = {},
): Promise<{ deleted: boolean; withdrawnApprovalId: number | null; archivedRiskIds: number[] }> {
  const {
    userId = null,
    alreadyLocked = false,
    withdrawApproval = true,
    recordHistory = true,
    archiveRisksLinkedOnlyHere = false,
  } = options;

  if (!alreadyLocked && !(await lockProjectForDelete(projectId, organizationId, transaction))) {
    // No such project in this organization: touch nothing else.
    return { deleted: false, withdrawnApprovalId: null, archivedRiskIds: [] };
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
      await withdrawApprovalRequestQuery(withdrawnApprovalId, organizationId, transaction, {
        // The use case is being deleted; there is no stage to move.
        releaseUseCase: false,
      });
    }
  }

  if (recordHistory && userId) {
    await recordUseCaseDeletion(projectId, userId, organizationId, transaction);
  }

  let archivedRiskIds: number[] = [];
  if (archiveRisksLinkedOnlyHere) {
    await lockRiskLinksOfProjectQuery(projectId, organizationId, transaction);
    const risks = await getRisksLinkedOnlyToProjectQuery(projectId, organizationId, transaction);
    if (risks && risks.length > 0) {
      const archived = await archiveRisksInBulkQuery(
        risks.map((risk) => risk.id),
        organizationId,
        userId ?? undefined,
        transaction,
      );
      archivedRiskIds = archived.map((row) => Number(row.id));
    }
  }

  // deleteProjectByIdQuery takes the lock again as its first statement; the
  // row is already locked by this transaction, so that is one cheap no-op.
  const deleted = await deleteProjectByIdQuery(projectId, organizationId, transaction);
  return { deleted, withdrawnApprovalId, archivedRiskIds };
}
