import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  getOverdueApprovalStepsQuery,
  markApprovalStepEscalatedQuery,
} from "../../../utils/approvalRequest.utils";
import { notifyApprovalStepOverdueEscalation } from "../../inAppNotification.service";
import logger, { logStructured } from "../../../utils/logger/fileLogger";

/**
 * Approval SLA escalation — hourly sweep.
 *
 * Finds the active step of each pending approval request whose due_at has
 * passed, claims it with a conditional UPDATE (escalated_at IS NULL), and
 * notifies the step's designated escalation user once, in-app plus email.
 *
 * Idempotency: claiming happens BEFORE notifying, so under retries or
 * concurrent workers exactly one caller wins the claim and at most one
 * escalation notification is ever sent per step. The trade-off is
 * at-most-once delivery: a notification failure after a successful claim is
 * logged but not retried. escalated_at and the notifications row are the
 * audit trail. Range comparison (due_at < NOW()) lets a missed run catch up.
 * Every row sits in its own try/catch — one failure never aborts the org or
 * the run.
 */

export interface ApprovalOverdueSweepSummary {
  scanned: number;
  escalated: number;
}

/** Sweep one org. Each row's claim + notify is isolated: log and continue. */
export async function runApprovalOverdueSweep(
  organizationId: number,
): Promise<ApprovalOverdueSweepSummary> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const rows = await getOverdueApprovalStepsQuery(organizationId);
  let escalated = 0;

  for (const row of rows) {
    try {
      const claimed = await markApprovalStepEscalatedQuery(organizationId, row.request_step_id);
      if (!claimed) continue;

      await notifyApprovalStepOverdueEscalation(
        organizationId,
        row.escalation_user_id,
        {
          id: row.request_id,
          name: row.request_name,
          stepName: row.step_name,
          stepNumber: row.step_number,
          dueAt: row.due_at,
        },
        baseUrl,
      );
      escalated++;

      logStructured(
        "successful",
        `escalated overdue approval step ${row.request_step_id} (request ${row.request_id}) to user ${row.escalation_user_id}`,
        "runApprovalOverdueSweep",
        "approvalOverdueSweep.ts",
      );
    } catch (error) {
      logger.error(
        `❌ Approval overdue escalation failed for org ${organizationId} request step ${row.request_step_id}:`,
        error,
      );
    }
  }

  return { scanned: rows.length, escalated };
}

/**
 * Sweep every org — the BullMQ hourly job entry point. Isolated per org so
 * one org's failure cannot block the others.
 */
export async function runApprovalOverdueSweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runApprovalOverdueSweep(org.id);
      if (summary.escalated > 0) {
        logger.info(
          `Approval overdue sweep org ${org.id}: scanned=${summary.scanned} escalated=${summary.escalated}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Approval overdue sweep failed for org ${org.id}:`, error);
    }
  }
}
