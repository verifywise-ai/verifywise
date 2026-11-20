import { ApprovalRequestStatus } from "../domain.layer/enums/approval-workflow.enum";

/**
 * SQL for an entity's latest approval decision: the status of its newest
 * request that is pending, approved or rejected (withdrawn requests never
 * decided anything and are skipped), or NULL when it has none. The arguments
 * are SQL expressions; callers bind any values they reference.
 *
 * Kept apart from approvalRequest.utils, which imports lifecycle.utils, so
 * the lifecycle go-live condition can use it too.
 */
export const latestApprovalStatusSql = (
  organizationIdSql: string,
  entityTypeSql: string,
  entityIdSql: string,
): string => `(SELECT ar.status
     FROM approval_requests ar
    WHERE ar.organization_id = ${organizationIdSql}
      AND ar.entity_type = ${entityTypeSql}
      AND ar.entity_id = ${entityIdSql}
      AND ar.status IN ('${ApprovalRequestStatus.PENDING}', '${ApprovalRequestStatus.APPROVED}', '${ApprovalRequestStatus.REJECTED}')
    ORDER BY ar.created_at DESC, ar.id DESC
    LIMIT 1)`;
