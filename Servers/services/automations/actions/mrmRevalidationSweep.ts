import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  getDueRevalidationsQuery,
  triggerRevalidation,
} from "../../../utils/mrmRevalidation.utils";
import {
  loadMrmAlertContext,
  MrmAlertContext,
  notifyRevalidationDue,
} from "../../../utils/mrmAlerts.utils";
import { MrmRevalidationTriggerSource } from "../../../domain.layer/enums/mrmMonitoring.enum";
import logger from "../../../utils/logger/fileLogger";

/**
 * MRM (Model Risk Management) — Branch 3 scheduled revalidation sweep.
 *
 * Finds open validations whose next_due has passed and fires the SCHEDULED
 * revalidation trigger for each. Because a model already carrying an open
 * validation is deduped by triggerRevalidation (annotate, no second task), the
 * sweep is safe to re-run: an overdue open task is simply annotated with a
 * "periodic revalidation due" note, and a distinct audit event is recorded each
 * run. This is the connective tissue that turns a passed due-date into an action.
 */

export interface RevalidationSweepSummary {
  organization_id: number;
  due: number;
  opened: number;
  annotated: number;
}

/** Sweep one org. Each firing is isolated so one failure cannot poison the rest. */
export async function runRevalidationSweep(
  organizationId: number,
  now: Date = new Date(),
): Promise<RevalidationSweepSummary> {
  const due = await getDueRevalidationsQuery(organizationId, now);
  let opened = 0;
  let annotated = 0;

  // Org-constant alert inputs (settings + extra recipients) load at most once
  // per sweep run, and only when a row actually wins the overdue claim.
  let alertContext: Promise<MrmAlertContext> | null = null;
  const loadAlertContext = () => (alertContext ??= loadMrmAlertContext(organizationId));

  for (const row of due) {
    try {
      const result = await triggerRevalidation(
        organizationId,
        row.model_inventory_id,
        MrmRevalidationTriggerSource.SCHEDULED,
        "periodic revalidation due",
        { next_due: row.next_due, swept_at: now.toISOString() },
      );
      if (result.created_validation) {
        opened += 1;
      } else {
        annotated += 1;
      }

      // Once-per-lifecycle overdue nudge (claimed via overdue_notified_at) —
      // its failure must never fail the sweep for the remaining models.
      if (result.validation_id != null) {
        try {
          await notifyRevalidationDue(
            organizationId,
            row.model_inventory_id,
            result.validation_id,
            row.next_due,
            loadAlertContext,
          );
        } catch (error) {
          logger.error(
            `❌ Overdue-validation alert failed for org ${organizationId} model ${row.model_inventory_id}:`,
            error,
          );
        }
      }
    } catch (error) {
      logger.error(
        `❌ Revalidation sweep failed for org ${organizationId} model ${row.model_inventory_id}:`,
        error,
      );
    }
  }

  return { organization_id: organizationId, due: due.length, opened, annotated };
}

/**
 * Sweep every org — the BullMQ daily job entry point. Isolated per org so one
 * org's failure cannot block the others.
 */
export async function runRevalidationSweepAllOrgs(): Promise<void> {
  const now = new Date();
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runRevalidationSweep(org.id, now);
      if (summary.due > 0) {
        logger.info(
          `MRM revalidation sweep org ${org.id}: due=${summary.due} opened=${summary.opened} annotated=${summary.annotated}`,
        );
      }
    } catch (error) {
      logger.error(`❌ MRM revalidation sweep failed for org ${org.id}:`, error);
    }
  }
}
