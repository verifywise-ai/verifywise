import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  getUnnotifiedStaleChildrenQuery,
  markParentLevelNotifiedQuery,
} from "../../../utils/riskLink.utils";
import { notifyParentLevelChanged } from "../../inAppNotification.service";
import logger from "../../../utils/logger/fileLogger";

/**
 * Stale-inheritance notification — nightly sweep.
 *
 * The flag itself is set by a DB trigger the moment a parent level moves, so it
 * is durable and needs no sweep. What the trigger cannot do is tell anyone: it
 * is SQL. This sweep delivers the owner notice and stamps a per-link
 * sent-record, retrying a recipient whose delivery failed on the next run.
 *
 * Idempotent by construction: `parent_level_notified_at` advances to
 * `parent_level_changed_at` only after a successful send, so a link is notified
 * once per change; a later change moves `parent_level_changed_at` past the
 * sent-record and re-arms it. A risk with no owner is skipped, not errored —
 * it is stamped so the scan does not revisit it forever, matching the evidence
 * sweep's "flagged but not notified" rule.
 */
export interface StaleInheritanceSweepSummary {
  organization_id: number;
  candidates: number;
  notified: number;
}

export async function runStaleInheritanceNotifySweep(
  organizationId: number,
): Promise<StaleInheritanceSweepSummary> {
  const rows = await getUnnotifiedStaleChildrenQuery(organizationId);
  let notified = 0;

  for (const row of rows) {
    if (row.risk_owner == null) {
      await markParentLevelNotifiedQuery(organizationId, row.link_id, row.parent_changed_at);
      continue;
    }
    try {
      await notifyParentLevelChanged(organizationId, {
        id: row.child_risk_id,
        risk_name: row.child_name,
        risk_owner: row.risk_owner,
      });
      await markParentLevelNotifiedQuery(organizationId, row.link_id, row.parent_changed_at);
      notified += 1;
    } catch (error) {
      logger.error(
        `❌ Stale-inheritance notification failed for org ${organizationId} link ${row.link_id}:`,
        error,
      );
    }
  }

  return { organization_id: organizationId, candidates: rows.length, notified };
}

/**
 * Sweep every org — the BullMQ daily job entry point. Isolated per org so one
 * org's failure cannot block the others.
 */
export async function runStaleInheritanceNotifySweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runStaleInheritanceNotifySweep(org.id);
      if (summary.notified > 0) {
        logger.info(
          `Stale-inheritance sweep org ${org.id}: candidates=${summary.candidates} notified=${summary.notified}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Stale-inheritance sweep failed for org ${org.id}:`, error);
    }
  }
}
