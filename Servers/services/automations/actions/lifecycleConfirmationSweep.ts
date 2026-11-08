import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  LIFECYCLE_ENTITIES,
  LifecycleEntityConfig,
  findConfirmationsDue,
  getLifecycleOrgSettings,
  markConfirmationReminded,
} from "../../../utils/lifecycle.utils";
import { notifyLifecycleConfirmationDue } from "../../inAppNotification.service";
import { notifyExternalOwnerConfirmationDue } from "../../externalOwnerNotification.service";
import logger from "../../../utils/logger/fileLogger";

/**
 * Daily "still live?" sweep (#5187).
 *
 * For every entity with a lifecycle (use cases today; AI apps plug in through
 * LIFECYCLE_ENTITIES), finds live entries whose last confirmation (or go-live
 * date) is older than the org's interval and emails the owner (a user, or an
 * external owner with no account, who gets email only). The entry's
 * confirmation_reminded_at is stamped after a successful send, so each owner
 * hears about an entry once per period rather than every day. A failed send
 * is not stamped and is retried the next day.
 *
 * Stale entries are flagged in the UI from the same predicate (staleSql), so
 * the marker does not depend on this job having run.
 */

export interface LifecycleSweepSummary {
  organization_id: number;
  entity: string;
  candidates: number;
  notified: number;
}

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(String(value));
  return isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
};

export async function runLifecycleConfirmationSweep(
  organizationId: number,
  entity: LifecycleEntityConfig,
): Promise<LifecycleSweepSummary> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const { confirmation_interval_days: intervalDays } =
    await getLifecycleOrgSettings(organizationId);
  const rows = await findConfirmationsDue(entity, organizationId, intervalDays);

  let notified = 0;
  for (const row of rows) {
    try {
      if (row.owner !== null && row.owner !== undefined) {
        await notifyLifecycleConfirmationDue(
          organizationId,
          Number(row.owner),
          {
            id: Number(row.id),
            title: row.title,
            noun: entity.noun,
            path: entity.path(Number(row.id)),
            entityType: entity.notificationEntityType,
            since: formatDate(row.baseline),
            intervalDays,
          },
          baseUrl,
        );
      } else if (row.external_owner_email) {
        // No account, so email only: no in-app row and no link to the app.
        await notifyExternalOwnerConfirmationDue({
          organizationId,
          entryTitle: row.title,
          noun: entity.noun,
          since: formatDate(row.baseline),
          intervalDays,
          recipient: {
            name: row.external_owner_name || row.external_owner_email,
            email: row.external_owner_email,
          },
          contactUserId: row.contact_user_id ?? null,
        });
      } else {
        continue;
      }
      await markConfirmationReminded(entity, organizationId, Number(row.id));
      notified += 1;
    } catch (error) {
      logger.error(
        `❌ Still-live reminder failed for ${entity.key} ${row.id} (org ${organizationId}):`,
        error,
      );
    }
  }

  return { organization_id: organizationId, entity: entity.key, candidates: rows.length, notified };
}

/** BullMQ entry point: every org, every lifecycle entity, each isolated. */
export async function runLifecycleConfirmationSweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    for (const entity of Object.values(LIFECYCLE_ENTITIES)) {
      try {
        const summary = await runLifecycleConfirmationSweep(org.id, entity);
        if (summary.candidates > 0) {
          logger.info(
            `Still-live sweep org ${org.id} ${entity.key}: candidates=${summary.candidates} notified=${summary.notified}`,
          );
        }
      } catch (error) {
        logger.error(`❌ Still-live sweep failed for org ${org.id} (${entity.key}):`, error);
      }
    }
  }
}
